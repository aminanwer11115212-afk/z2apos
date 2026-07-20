import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole, formatSDG } from "@/lib/auth";
import { Modal, Field, Input, Textarea, Btn, PageHeader, SearchBar, EmptyState, useDialog } from "@/components/ui-kit";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/parts")({
  head: () => ({ meta: [{ title: "قطع الغيار — 2A" }] }),
  component: PartsPage,
});

type Part = {
  id: string; code: string; name: string; category: string | null; car_model: string | null;
  cost_price: number; sell_price: number; quantity: number; min_quantity: number; notes: string | null;
};

const empty = { code: "", name: "", category: "", car_model: "", cost_price: 0, sell_price: 0, quantity: 0, min_quantity: 0, notes: "" };

function PartsPage() {
  const qc = useQueryClient();
  const { data: role } = useMyRole();
  const isAdmin = role === "admin";
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
      const payload = { ...form, cost_price: Number(form.cost_price), sell_price: Number(form.sell_price),
        quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) };
      if (editing) {
        const { error } = await supabase.from("parts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parts").insert(payload);
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
    setForm({ code: p.code, name: p.name, category: p.category ?? "", car_model: p.car_model ?? "",
      cost_price: p.cost_price, sell_price: p.sell_price, quantity: p.quantity, min_quantity: p.min_quantity, notes: p.notes ?? "" });
    dialog.show();
  };

  const filtered = data.filter((p) =>
    !q || p.name.includes(q) || p.code.includes(q) || (p.car_model ?? "").includes(q) || (p.category ?? "").includes(q)
  );

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="قطع الغيار" subtitle={`${data.length} صنف`}
        actions={isAdmin && <Btn onClick={openNew}><Plus className="w-4 h-4 inline ml-1" />صنف جديد</Btn>} />

      <div className="mb-4"><SearchBar value={q} onChange={setQ} placeholder="بحث بالكود، الاسم، الفئة، الموديل..." /></div>

      {isLoading ? <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p> :
       filtered.length === 0 ? <EmptyState title="لا توجد قطع بعد" action={isAdmin && <Btn onClick={openNew}>إضافة أول صنف</Btn>} /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-right p-3 font-medium">الكود</th>
                  <th className="text-right p-3 font-medium">الاسم</th>
                  <th className="text-right p-3 font-medium hidden sm:table-cell">الموديل</th>
                  <th className="text-right p-3 font-medium">سعر البيع</th>
                  <th className="text-right p-3 font-medium">الكمية</th>
                  {isAdmin && <th className="p-3"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = Number(p.quantity) <= Number(p.min_quantity);
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{p.code}</td>
                      <td className="p-3 font-medium">{p.name}
                        {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">{p.car_model || "—"}</td>
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
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.code || !form.name}>حفظ</Btn>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="الكود *"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="الفئة"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          </div>
          <Field label="الاسم *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="موديل السيارة"><Input value={form.car_model} onChange={(e) => setForm({ ...form, car_model: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر التكلفة"><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} /></Field>
            <Field label="سعر البيع"><Input type="number" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الكمية"><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
            <Field label="الحد الأدنى"><Input type="number" step="0.01" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) })} /></Field>
          </div>
          <Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
