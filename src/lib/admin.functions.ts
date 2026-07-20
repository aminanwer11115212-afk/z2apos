import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> }; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error("فشل التحقّق من الصلاحية");
  if (!data) throw new Error("مسموح للمديرين فقط");
}

// ─────────── إدارة المستخدمين ───────────

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList, error: e1 } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (e1) throw new Error(e1.message);
    const ids = authList.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, full_name").in("user_id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
    const rmap = new Map((roles ?? []).map((r) => [r.user_id, r.role as "admin" | "seller"]));
    return authList.users.map((u) => ({
      user_id: u.id,
      email: u.email ?? "",
      full_name: pmap.get(u.id) ?? "",
      role: rmap.get(u.id) ?? null,
      created_at: u.created_at,
      banned: !!u.banned_until,
    }));
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; fullName: string; role: "admin" | "seller" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.email.includes("@")) throw new Error("بريد غير صالح");
    if (data.password.length < 6) throw new Error("كلمة المرور 6 أحرف على الأقل");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ user_id: uid, full_name: data.fullName }, { onConflict: "user_id" });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    return { ok: true, user_id: uid };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.password.length < 6) throw new Error("كلمة المرور 6 أحرف على الأقل");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "seller" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────── تصدير / استيراد ───────────

const DATA_TABLES = ["parts", "customers", "suppliers", "sales", "sale_items", "purchases", "purchase_items"] as const;

export const adminExportAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dump: Record<string, unknown[]> = {};
    for (const t of DATA_TABLES) {
      const { data, error } = await supabaseAdmin.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      dump[t] = data ?? [];
    }
    return { version: 1, exportedAt: new Date().toISOString(), tables: dump };
  });

export const adminImportAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { payload: { tables: Record<string, unknown[]> }; wipeFirst: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.wipeFirst) {
      // احذف بالترتيب العكسي بسبب FKs
      for (const t of [...DATA_TABLES].reverse()) {
        const { error } = await supabaseAdmin.from(t).delete().not("id", "is", null);
        if (error) throw new Error(`${t} wipe: ${error.message}`);
      }
    }
    const counts: Record<string, number> = {};
    for (const t of DATA_TABLES) {
      const rows = data.payload.tables[t];
      if (!Array.isArray(rows) || rows.length === 0) { counts[t] = 0; continue; }
      // upsert بدفعات 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from(t).upsert(chunk as never, { onConflict: "id" });
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      counts[t] = rows.length;
    }
    return { ok: true, counts };
  });

// ─────────── بيانات تجريبية ───────────

const CATEGORIES = ["فلاتر", "شمعات", "كوابح", "زيوت", "إطارات", "بطاريات", "أحزمة", "مضخات", "حساسات", "إضاءة"];
const CAR_TYPES = ["تويوتا كورولا", "هيونداي أكسنت", "كيا سيراتو", "نيسان صني", "ميتسوبيشي لانسر", "شيفروليه أوبترا", "هوندا سيفيك", "فورد فوكس", "مازدا 3", "سوزوكي سويفت"];
const PART_TEMPLATES = [
  "فلتر زيت", "فلتر هواء", "فلتر بنزين", "فلتر مكيف",
  "شمعة إشعال", "طرمبة ماء", "طرمبة بنزين", "قماشات فرامل أمامية", "قماشات فرامل خلفية",
  "ديسك فرامل", "زيت محرك 5W30", "زيت جير", "بطارية 70 أمبير", "بطارية 100 أمبير",
  "إطار 175/70", "إطار 195/65", "حزام سير", "حزام تايمن", "دايناموا", "سلف",
  "لمبة أمامية", "لمبة خلفية", "مساحات زجاج", "بواجي", "سلندر كوبري", "بوش مقصات",
  "كوبلن", "طقم دبرياج", "رديتر", "خرطوم رديتر", "مروحة مبرد",
];
const CUSTOMER_NAMES = ["محمد أحمد", "علي حسن", "أحمد عبدالله", "خالد ياسين", "عمر فاروق", "يوسف إبراهيم", "سلمان مهدي", "طارق زياد", "نور الدين", "فؤاد كامل", "بشير سعيد", "عادل جميل", "ماجد سليم", "حسام رفيق", "زياد أنور", "فارس نبيل", "رامي وائل", "سامي عصام", "أنس هيثم", "بلال طه"];
const SUPPLIER_NAMES = ["شركة النور", "مؤسسة الوفاء", "الأمانة للتجارة", "الرياض للاستيراد", "المتحدة", "الأصيل", "درة الخرطوم", "قطع أم درمان", "الفارس", "الرواد"];

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export const adminSeedDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) قطع الغيار — 1000
    const parts = Array.from({ length: 1000 }, (_, i) => {
      const cost = randInt(500, 15000);
      return {
        code: `P${(100000 + i).toString()}`,
        name: `${rand(PART_TEMPLATES)} — ${rand(CAR_TYPES)}`,
        category: rand(CATEGORIES),
        car_model: rand(CAR_TYPES),
        cost_price: cost,
        sell_price: Math.round(cost * (1.2 + Math.random() * 0.6)),
        quantity: 0, // سيرتفع من المشتريات
        min_quantity: randInt(1, 5),
      };
    });
    const insertedParts: { id: string; sell_price: number }[] = [];
    for (let i = 0; i < parts.length; i += 500) {
      const { data, error } = await supabaseAdmin.from("parts").insert(parts.slice(i, i + 500)).select("id, sell_price");
      if (error) throw new Error("parts: " + error.message);
      insertedParts.push(...(data ?? []));
    }

    // 2) عملاء وموردون
    const customers = CUSTOMER_NAMES.concat(CUSTOMER_NAMES.map((n) => n + " ٢")).concat(CUSTOMER_NAMES.slice(0, 10).map((n) => n + " ٣"))
      .map((name) => ({ name, phone: `09${randInt(10000000, 99999999)}` }));
    const suppliers = SUPPLIER_NAMES.concat(SUPPLIER_NAMES.map((n) => n + " ٢")).map((name) => ({ name, phone: `09${randInt(10000000, 99999999)}` }));
    const { data: insC, error: eC } = await supabaseAdmin.from("customers").insert(customers).select("id");
    if (eC) throw new Error("customers: " + eC.message);
    const { data: insS, error: eS } = await supabaseAdmin.from("suppliers").insert(suppliers).select("id");
    if (eS) throw new Error("suppliers: " + eS.message);

    // 3) مشتريات — 200 فاتورة لإدخال المخزون
    const now = Date.now();
    const yearMs = 365 * 24 * 3600 * 1000;
    const purchaseRows = Array.from({ length: 200 }, () => ({
      supplier_id: rand(insS!).id,
      paid: 0, // سيُحدَّث لاحقاً
      created_by: context.userId,
      created_at: new Date(now - Math.floor(Math.random() * yearMs)).toISOString(),
    }));
    const insertedPur: { id: string }[] = [];
    for (let i = 0; i < purchaseRows.length; i += 500) {
      const { data, error } = await supabaseAdmin.from("purchases").insert(purchaseRows.slice(i, i + 500)).select("id");
      if (error) throw new Error("purchases: " + error.message);
      insertedPur.push(...(data ?? []));
    }
    const purchaseItems: { purchase_id: string; part_id: string; qty: number; unit_cost: number }[] = [];
    for (const p of insertedPur) {
      const n = randInt(3, 10);
      for (let k = 0; k < n; k++) {
        const part = rand(insertedParts);
        purchaseItems.push({
          purchase_id: p.id, part_id: part.id,
          qty: randInt(20, 100),
          unit_cost: Math.round(Number(part.sell_price) * 0.7),
        });
      }
    }
    for (let i = 0; i < purchaseItems.length; i += 500) {
      const { error } = await supabaseAdmin.from("purchase_items").insert(purchaseItems.slice(i, i + 500));
      if (error) throw new Error("purchase_items: " + error.message);
    }

    // 4) مبيعات — 1000 فاتورة
    const saleRows = Array.from({ length: 1000 }, () => ({
      customer_id: Math.random() < 0.7 ? rand(insC!).id : null,
      discount: 0,
      paid: 0,
      created_by: context.userId,
      created_at: new Date(now - Math.floor(Math.random() * yearMs * 0.9)).toISOString(),
    }));
    const insertedSales: { id: string }[] = [];
    for (let i = 0; i < saleRows.length; i += 500) {
      const { data, error } = await supabaseAdmin.from("sales").insert(saleRows.slice(i, i + 500)).select("id");
      if (error) throw new Error("sales: " + error.message);
      insertedSales.push(...(data ?? []));
    }
    const saleItems: { sale_id: string; part_id: string; qty: number; unit_price: number }[] = [];
    for (const s of insertedSales) {
      const n = randInt(1, 5);
      for (let k = 0; k < n; k++) {
        const part = rand(insertedParts);
        saleItems.push({
          sale_id: s.id, part_id: part.id,
          qty: randInt(1, 4),
          unit_price: Number(part.sell_price),
        });
      }
    }
    for (let i = 0; i < saleItems.length; i += 500) {
      const { error } = await supabaseAdmin.from("sale_items").insert(saleItems.slice(i, i + 500));
      if (error) throw new Error("sale_items: " + error.message);
    }

    return {
      parts: insertedParts.length,
      customers: insC!.length,
      suppliers: insS!.length,
      purchases: insertedPur.length,
      purchase_items: purchaseItems.length,
      sales: insertedSales.length,
      sale_items: saleItems.length,
    };
  });

export const adminWipeData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const t of [...DATA_TABLES].reverse()) {
      const { error } = await supabaseAdmin.from(t).delete().not("id", "is", null);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    return { ok: true };
  });
