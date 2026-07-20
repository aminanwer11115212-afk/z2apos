import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Modal, Field, Input, Btn, PageHeader, SearchBar, EmptyState, useDialog } from "@/components/ui-kit";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — 2A" }] }),
  component: SuppliersPage,
});

type Supplier = { id: string; name: string; phone: string | null; address: string | null; balance: number };

function SuppliersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dialog = useDialog();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });

  const { data = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) { const { error } = await supabase.from("suppliers").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("suppliers").insert(form); if (error) throw error; }
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["suppliers"] }); dialog.hide(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("suppliers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", phone: "", address: "" }); dialog.show(); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, phone: s.phone ?? "", address: s.address ?? "" }); dialog.show(); };

  const filtered = data.filter((c) => !q || c.name.includes(q) || (c.phone ?? "").includes(q));

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <PageHeader title="الموردون" subtitle={`${data.length} مورد`}
        actions={<Btn onClick={openNew}><Plus className="w-4 h-4 inline ml-1" />مورد جديد</Btn>} />
      <div className="mb-4"><SearchBar value={q} onChange={setQ} placeholder="بحث..." /></div>

      {filtered.length === 0 ? <EmptyState title="لا يوجد موردون بعد" /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-medium">الاسم</th>
                <th className="text-right p-3 font-medium">الهاتف</th>
                <th className="text-right p-3 font-medium">المستحق</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">{s.name}
                    {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                  </td>
                  <td className="p-3" dir="ltr">{s.phone || "—"}</td>
                  <td className={`p-3 font-semibold ${Number(s.balance) > 0 ? "text-destructive" : ""}`}>{formatSDG(s.balance)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("حذف هذا المورد؟")) del.mutate(s.id); }}
                      className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={dialog.open} onClose={dialog.hide} title={editing ? "تعديل مورد" : "مورد جديد"}
        footer={<>
          <Btn variant="outline" onClick={dialog.hide}>إلغاء</Btn>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.name}>حفظ</Btn>
        </>}>
        <div className="space-y-3">
          <Field label="الاسم *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="الهاتف"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-right" /></Field>
          <Field label="العنوان"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
