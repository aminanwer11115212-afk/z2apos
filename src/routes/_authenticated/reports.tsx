import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { PageHeader, Field, Input, Btn } from "@/components/ui-kit";
import { Logo } from "@/components/Logo";
import { paymentMethodLabel } from "@/lib/payments";
import { Printer, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "التقارير — 2A" }] }),
  component: Reports,
});

type Preset = "today" | "yesterday" | "week" | "month" | "year" | "custom";

function rangeFor(preset: Preset, from: string, to: string): { from: string; to: string } {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: iso(t), to: iso(t) };
  if (preset === "yesterday") { const y = new Date(t); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
  if (preset === "week") { const w = new Date(t); w.setDate(w.getDate() - 6); return { from: iso(w), to: iso(t) }; }
  if (preset === "month") { const m = new Date(t.getFullYear(), t.getMonth(), 1); return { from: iso(m), to: iso(t) }; }
  if (preset === "year") { const y = new Date(t.getFullYear(), 0, 1); return { from: iso(y), to: iso(t) }; }
  return { from, to };
}

function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [sellerId, setSellerId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [category, setCategory] = useState("");

  const range = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers-list"],
    queryFn: async () => (await supabase.from("profiles").select("user_id, full_name")).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lite"],
    queryFn: async () => (await supabase.from("customers").select("id,name").order("name")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["parts-cats"],
    queryFn: async () => {
      const { data } = await supabase.from("parts").select("category").not("category", "is", null);
      return Array.from(new Set((data ?? []).map((r) => r.category as string).filter(Boolean))).sort();
    },
  });

  const { data } = useQuery({
    queryKey: ["reports", range, sellerId, customerId, category],
    queryFn: async () => {
      const start = new Date(range.from + "T00:00:00").toISOString();
      const end = new Date(range.to + "T23:59:59").toISOString();

      let salesQ = supabase.from("sales").select("id,total,discount,paid,created_at,created_by,customer_id").gte("created_at", start).lte("created_at", end);
      if (sellerId) salesQ = salesQ.eq("created_by", sellerId);
      if (customerId) salesQ = salesQ.eq("customer_id", customerId);
      const { data: sales } = await salesQ;
      const saleIds = (sales ?? []).map((s) => s.id);

      const { data: purchases } = await supabase.from("purchases").select("total,paid,created_at").gte("created_at", start).lte("created_at", end);

      let partsQ = supabase.from("parts").select("name,category,quantity,cost_price,sell_price,min_quantity");
      if (category) partsQ = partsQ.eq("category", category);
      const { data: parts } = await partsQ;

      // Sale items → top products + COGS (current cost)
      let items: { qty: number; subtotal: number; parts: { name: string; cost_price: number; category: string | null } | null }[] = [];
      if (saleIds.length > 0) {
        const { data: it } = await supabase
          .from("sale_items")
          .select("qty,subtotal,parts(name,cost_price,category)")
          .in("sale_id", saleIds);
        items = (it ?? []) as unknown as typeof items;
      }
      const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
      let cogs = 0;
      for (const it of items) {
        if (category && it.parts?.category !== category) continue;
        cogs += Number(it.qty) * Number(it.parts?.cost_price ?? 0);
        const key = it.parts?.name ?? "—";
        const cur = topMap.get(key) ?? { name: key, qty: 0, revenue: 0 };
        cur.qty += Number(it.qty);
        cur.revenue += Number(it.subtotal);
        topMap.set(key, cur);
      }
      const topProducts = Array.from(topMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

      // Payments breakdown by method
      const { data: payments } = await supabase
        .from("payments")
        .select("amount,method,direction")
        .gte("created_at", start).lte("created_at", end);
      const methodMap: Record<string, { in: number; out: number }> = {};
      for (const p of payments ?? []) {
        const k = p.method ?? "cash";
        methodMap[k] ??= { in: 0, out: 0 };
        if (p.direction === "in") methodMap[k].in += Number(p.amount);
        else methodMap[k].out += Number(p.amount);
      }

      const salesNet = (sales ?? []).reduce((s, r) => s + Number(r.total) - Number(r.discount), 0);
      const salesCollected = (sales ?? []).reduce((s, r) => s + Number(r.paid), 0);
      const purchasesTotal = (purchases ?? []).reduce((s, r) => s + Number(r.total), 0);
      const purchasesPaid = (purchases ?? []).reduce((s, r) => s + Number(r.paid), 0);
      const stockValueCost = (parts ?? []).reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
      const stockValueSell = (parts ?? []).reduce((s, p) => s + Number(p.quantity) * Number(p.sell_price), 0);
      const lowStock = (parts ?? []).filter((p) => Number(p.quantity) <= Number(p.min_quantity)).length;

      return {
        salesCount: sales?.length ?? 0, salesNet, salesCollected,
        purchasesCount: purchases?.length ?? 0, purchasesTotal, purchasesPaid,
        stockValueCost, stockValueSell, stockCount: parts?.length ?? 0, lowStock,
        cogs, profit: salesNet - cogs, topProducts, methodMap,
      };
    },
  });

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["الفترة", `${range.from} → ${range.to}`],
      [],
      ["ملخص المبيعات"],
      ["عدد الفواتير", data.salesCount],
      ["إجمالي (صافي)", data.salesNet],
      ["المحصّل", data.salesCollected],
      ["المتبقي", data.salesNet - data.salesCollected],
      ["تكلفة المبيعات", data.cogs],
      ["إجمالي الربح", data.profit],
      [],
      ["ملخص المشتريات"],
      ["عدد الفواتير", data.purchasesCount],
      ["إجمالي", data.purchasesTotal],
      ["المدفوع", data.purchasesPaid],
      ["المستحق", data.purchasesTotal - data.purchasesPaid],
      [],
      ["المخزون"],
      ["عدد الأصناف", data.stockCount],
      ["منخفضة", data.lowStock],
      ["القيمة بالتكلفة", data.stockValueCost],
      ["القيمة بالبيع", data.stockValueSell],
      [],
      ["الأصناف الأكثر مبيعاً"],
      ["الاسم", "الكمية", "الإيراد"],
      ...data.topProducts.map((p) => [p.name, p.qty, p.revenue] as (string | number)[]),
      [],
      ["الدفعات حسب الطريقة"],
      ["الطريقة", "تحصيل", "سداد"],
      ...Object.entries(data.methodMap).map(([m, v]) => [paymentMethodLabel(m), v.in, v.out] as (string | number)[]),
    ];
    downloadCSV(`2a-report-${range.from}_${range.to}.csv`, rows);
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="no-print">
        <PageHeader
          title="التقارير"
          subtitle="ملخص المبيعات والمشتريات والمخزون"
          actions={<div className="flex gap-2">
            <Btn variant="outline" onClick={exportCsv}><Download className="w-4 h-4 inline ml-1" />CSV</Btn>
            <Btn variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 inline ml-1" />طباعة</Btn>
          </div>}
        />

        <div className="bg-card border rounded-2xl p-4 mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["today", "اليوم"], ["yesterday", "أمس"], ["week", "٧ أيام"],
              ["month", "هذا الشهر"], ["year", "هذه السنة"], ["custom", "مخصّص"],
            ] as [Preset, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${preset === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Field label="من"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="إلى"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="البائع">
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
                <option value="">— الكل —</option>
                {sellers.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name || s.user_id.slice(0, 8)}</option>)}
              </select>
            </Field>
            <Field label="العميل">
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
                <option value="">— الكل —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="فئة (للمخزون)">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
                <option value="">— الكل —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="print-area space-y-6">
        <div className="hidden print:flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-3">
            <Logo variant="light" className="h-12 w-auto" />
            <div>
              <div className="font-bold text-lg">نظام 2A — التقارير</div>
              <div className="text-xs muted-print text-muted-foreground">قطع غيار السيارات</div>
            </div>
          </div>
          <div className="text-left text-xs muted-print text-muted-foreground">
            <div>الفترة: {range.from} → {range.to}</div>
            <div>طُبعت: {new Date().toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}</div>
          </div>
        </div>

        <Section title="المبيعات">
          <Stat label="عدد الفواتير" value={String(data?.salesCount ?? 0)} />
          <Stat label="الصافي" value={formatSDG(data?.salesNet ?? 0)} />
          <Stat label="المحصّل" value={formatSDG(data?.salesCollected ?? 0)} />
          <Stat label="المتبقي" value={formatSDG((data?.salesNet ?? 0) - (data?.salesCollected ?? 0))} highlight />
        </Section>

        <Section title="المشتريات">
          <Stat label="عدد الفواتير" value={String(data?.purchasesCount ?? 0)} />
          <Stat label="الإجمالي" value={formatSDG(data?.purchasesTotal ?? 0)} />
          <Stat label="المدفوع" value={formatSDG(data?.purchasesPaid ?? 0)} />
          <Stat label="المستحق" value={formatSDG((data?.purchasesTotal ?? 0) - (data?.purchasesPaid ?? 0))} highlight />
        </Section>

        <Section title={`المخزون${category ? ` — ${category}` : ""}`}>
          <Stat label="عدد الأصناف" value={String(data?.stockCount ?? 0)} />
          <Stat label="أصناف منخفضة" value={String(data?.lowStock ?? 0)} />
          <Stat label="قيمة (تكلفة)" value={formatSDG(data?.stockValueCost ?? 0)} />
          <Stat label="قيمة (بيع)" value={formatSDG(data?.stockValueSell ?? 0)} highlight />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-2xl p-4">
      <h2 className="font-bold mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-primary/10" : "bg-muted"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
