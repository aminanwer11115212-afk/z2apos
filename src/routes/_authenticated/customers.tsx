import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Modal, Field, Input, Btn, PageHeader, SearchBar, EmptyState, useDialog } from "@/components/ui-kit";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Plus, Pencil, Trash2, Wallet, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "العملاء — 2A" }] }),
  component: CustomersPage,
});

type Customer = { id: string; name: string; phone: string | null; address: string | null; balance: number };

function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dialog = useDialog();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [payFor, setPayFor] = useState<Customer | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("customers").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["customers"] }); dialog.hide(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", phone: "", address: "" }); dialog.show(); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "" }); dialog.show(); };

  const filtered = data.filter((c) => !q || c.name.includes(q) || (c.phone ?? "").includes(q));

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <PageHeader title="العملاء" subtitle={`${data.length} عميل`}
        actions={<Btn onClick={openNew}><Plus className="w-4 h-4 inline ml-1" />عميل جديد</Btn>} />
      <div className="mb-4"><SearchBar value={q} onChange={setQ} placeholder="بحث بالاسم أو الهاتف..." /></div>

      {filtered.length === 0 ? <EmptyState title="لا يوجد عملاء بعد" /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-medium">الاسم</th>
                <th className="text-right p-3 font-medium">الهاتف</th>
                <th className="text-right p-3 font-medium">الرصيد</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">
                    <Link to="/customers/$id" params={{ id: c.id }} className="text-primary hover:underline">{c.name}</Link>
                    {c.address && <div className="text-xs text-muted-foreground">{c.address}</div>}
                  </td>
                  <td className="p-3" dir="ltr">{c.phone || "—"}</td>
                  <td className={`p-3 font-semibold ${Number(c.balance) > 0 ? "text-destructive" : ""}`}>{formatSDG(c.balance)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {Number(c.balance) > 0 && (
                      <button onClick={() => setPayFor(c)} title="تحصيل"
                        className="p-2 hover:bg-success/10 text-success rounded-lg"><Wallet className="w-4 h-4" /></button>
                    )}
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer"
                        title="واتساب" className="inline-block p-2 hover:bg-muted rounded-lg"><MessageCircle className="w-4 h-4" /></a>
                    )}
                    <button onClick={() => openEdit(c)} className="p-2 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("حذف هذا العميل؟")) del.mutate(c.id); }}
                      className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={dialog.open} onClose={dialog.hide} title={editing ? "تعديل عميل" : "عميل جديد"}
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

      {payFor && (
        <PaymentDialog open={!!payFor} onClose={() => setPayFor(null)}
          direction="in"
          party={{ id: payFor.id, name: payFor.name, balance: Number(payFor.balance) }}
          suggested={Number(payFor.balance)} />
      )}
    </div>
  );
}
