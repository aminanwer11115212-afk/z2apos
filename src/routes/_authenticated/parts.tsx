import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole, formatSDG } from "@/lib/auth";
import { useSettings, isLowStock } from "@/lib/settings";
import { Modal, Field, Input, Btn, PageHeader, SearchBar, EmptyState, useDialog } from "@/components/ui-kit";
import { Plus, Pencil, Trash2, AlertTriangle, Barcode as BarcodeIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/parts")({
  head: () => ({ meta: [{ title: "قطع الغيار — 2A" }] }),
  component: PartsPage,
});

type Part = {
  id: string; code: string; name: string; category: string | null; car_model: string | null;
  cost_price: number; sell_price: number; quantity: number; min_quantity: number;
};

const empty = { name: "", category: "", car_model: "", cost_price: 0, sell_price: 0, quantity: 0, min_quantity: 0 };

function autoCode() {
  return `P${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`;
}

function PartsPage() {
  const qc = useQueryClient();
  const settings = useSettings();
  const { data: role } = useMyRole();
  const isAdmin = role === "admin";
  // Sellers see cost only when the admin grants it; admins always do.
  const canSeeCost = isAdmin || settings.sellerPerms.seeCost;
  const [q, setQ] = useState("");
  const dialog = useDialog();
  const [editing, setEditing] = useState<Part | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["parts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select("*").order("name");
      if (error) throw error;
      return data as Part[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        car_model: form.car_model.trim() || null,
        cost_price: Number(form.cost_price),
        sell_price: Number(form.sell_price),
        quantity: Number(form.quantity),
        min_quantity: Number(form.min_quantity),
      };
      if (editing) {
        const { error } = await supabase.from("parts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parts").insert({ ...payload, code: autoCode() });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["parts"] }); dialog.hide(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["parts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm(empty); dialog.show(); };
  const openEdit = (p: Part) => {
    setEditing(p);
    setForm({
      name: p.name, category: p.category ?? "", car_model: p.car_model ?? "",
      cost_price: p.cost_price, sell_price: p.sell_price, quantity: p.quantity, min_quantity: p.min_quantity,
    });
    dialog.show();
  };

  const s = q.trim().toLowerCase();
  const filtered = data.filter((p) =>
    !s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) ||
    (p.car_model ?? "").toLowerCase().includes(s) || (p.category ?? "").toLowerCase().includes(s)
  );

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="قطع الغيار" subtitle={`${data.length} صنف`}
        actions={<div className="flex gap-2">
          <Link to="/parts/labels"><Btn variant="outline"><BarcodeIcon className="w-4 h-4 inline ml-1" />باركود</Btn></Link>
          {isAdmin && <Btn onClick={openNew}><Plus className="w-4 h-4 inline ml-1" />صنف جديد</Btn>}
        </div>} />

      <div className="mb-4"><SearchBar value={q} onChange={setQ} placeholder="بحث بالكود، الاسم، الفئة، نوع السيارة..." /></div>

      {isLoading ? <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p> :
       filtered.length === 0 ? <EmptyState title="لا توجد قطع بعد" action={isAdmin && <Btn onClick={openNew}>إضافة أول صنف</Btn>} /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-right p-3 font-medium">الاسم</th>
                  <th className="text-right p-3 font-medium hidden sm:table-cell">الفئة</th>
                  <th className="text-right p-3 font-medium hidden md:table-cell">نوع السيارة</th>
                  {canSeeCost && <th className="text-right p-3 font-medium hidden lg:table-cell">سعر التكلفة</th>}
                  <th className="text-right p-3 font-medium">سعر البيع</th>
                  <th className="text-right p-3 font-medium">الكمية</th>
                  {isAdmin && <th className="p-3"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = isLowStock(p, settings);
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">{p.category || "—"}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{p.car_model || "—"}</td>
                      {canSeeCost && <td className="p-3 hidden lg:table-cell text-muted-foreground">{formatSDG(p.cost_price)}</td>}
                      <td className="p-3">{formatSDG(p.sell_price)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 ${low ? "text-destructive font-bold" : ""}`}>
                          {low && <AlertTriangle className="w-3.5 h-3.5" />}
                          {Number(p.quantity)}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-3 whitespace-nowrap">
                          <button onClick={() => openEdit(p)} className="p-2 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm("حذف هذا الصنف؟")) del.mutate(p.id); }}
                            className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={dialog.open} onClose={dialog.hide} title={editing ? "تعديل صنف" : "صنف جديد"}
        footer={<>
          <Btn variant="outline" onClick={dialog.hide}>إلغاء</Btn>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>حفظ</Btn>
        </>}>
        <div className="space-y-3">
          <Field label="الاسم *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="نوع السيارة"><Input value={form.car_model} onChange={(e) => setForm({ ...form, car_model: e.target.value })} placeholder="مثلاً: تويوتا كورولا" /></Field>
            <Field label="الفئة"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثلاً: فلاتر" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر البيع"><Input type="number" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: Number(e.target.value) })} /></Field>
            <Field label="سعر التكلفة"><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الكمية"><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
            <Field label="حد التنبيه"><Input type="number" step="0.01" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) })} /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
