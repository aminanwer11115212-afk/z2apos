import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Btn, PageHeader, Field, Input, Modal } from "@/components/ui-kit";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts/transfer")({
  head: () => ({ meta: [{ title: "تحويل بين الحسابات — 2A" }] }),
  component: TransferPage,
});

type Account = { id: string; name: string; type: string; balance: number };

function TransferPage() {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("name");
      if (error) throw error; return data as Account[];
    },
  });

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);

  const submit = async () => {
    if (!fromId || !toId) return toast.error("اختر الحسابين");
    if (fromId === toId) return toast.error("لا يمكن التحويل لنفس الحساب");
    if (!amount || amount <= 0) return toast.error("أدخل مبلغ صحيح");
    const fromBalance = Number(from?.balance ?? 0);
    if (amount > fromBalance) return toast.error(`الرصيد غير كافٍ: ${formatSDG(fromBalance)}`);

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    const { error } = await supabase.rpc("transfer_between_accounts", {
      p_from_account_id: fromId,
      p_to_account_id: toId,
      p_amount: amount,
      p_reference: reference.trim() || null,
      p_notes: notes.trim() || null,
      p_created_by: uid,
    });
    if (error) return toast.error(error.message);
    toast.success(`تم التحويل من ${from?.name} إلى ${to?.name}`);
    setFromId(""); setToId(""); setAmount(0); setReference(""); setNotes(""); setConfirmOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <PageHeader title="تحويل بين الحسابات" subtitle="نقل رصيد من حساب إلى آخر" />

      <div className="bg-card border rounded-2xl p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="من حساب">
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
              <option value="">— اختر —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatSDG(a.balance)})</option>)}
            </select>
          </Field>
          <Field label="إلى حساب">
            <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
              <option value="">— اختر —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatSDG(a.balance)})</option>)}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            {fromId && toId ? <ArrowLeft className="w-6 h-6" /> : <ArrowRight className="w-6 h-6" />}
          </div>
        </div>

        <Field label="المبلغ">
          <Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="رقم العملية / المرجع">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" className="text-right" />
        </Field>
        <Field label="ملاحظة">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Link to="/accounts" className="flex-1"><Btn variant="outline" className="w-full">العودة</Btn></Link>
          <Btn onClick={() => setConfirmOpen(true)} disabled={!fromId || !toId || amount <= 0} className="flex-1">متابعة التحويل</Btn>
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأكيد التحويل"
        footer={<>
          <Btn variant="outline" onClick={() => setConfirmOpen(false)}>إلغاء</Btn>
          <Btn onClick={submit}>تأكيد</Btn>
        </>}>
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">سيتم تحويل</p>
          <p className="text-2xl font-bold">{formatSDG(amount)}</p>
          <p className="text-sm">من <strong>{from?.name}</strong> إلى <strong>{to?.name}</strong></p>
        </div>
      </Modal>
    </div>
  );
}
