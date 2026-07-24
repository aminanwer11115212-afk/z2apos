import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Modal, Field, Input, Btn } from "@/components/ui-kit";
import { useSettings, parseNotes, encodeNotes } from "@/lib/settings";
import { toast } from "sonner";

type Kind = "sale" | "purchase";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  invoice: {
    id: string;
    total: number;
    discount?: number; // sales only
    paid: number;
    payment_method: string | null;
    account_name: string | null;
    notes: string | null;
  };
};

/**
 * Partial invoice editor: adjust discount / paid / payment method / account
 * / transaction reference / notes for an existing invoice. Item lines and
 * quantities remain immutable so stock stays consistent. DB triggers
 * automatically re-derive customer/supplier balances on UPDATE.
 */
export function EditInvoiceDialog({ open, onClose, kind, invoice }: Props) {
  const qc = useQueryClient();
  const settings = useSettings();
  const parsed = parseNotes(invoice.notes);

  const [discount, setDiscount] = useState(Number(invoice.discount ?? 0));
  const [paid, setPaid] = useState(Number(invoice.paid));
  const [method, setMethod] = useState<string>(invoice.payment_method ?? "cash");
  const [accountName, setAccountName] = useState<string>(invoice.account_name ?? parsed.account ?? "");
  const [txRef, setTxRef] = useState<string>(parsed.ref ?? "");
  const [noteText, setNoteText] = useState<string>(parsed.text);

  useEffect(() => {
    if (!open) return;
    setDiscount(Number(invoice.discount ?? 0));
    setPaid(Number(invoice.paid));
    setMethod(invoice.payment_method ?? "cash");
    setAccountName(invoice.account_name ?? parsed.account ?? "");
    setTxRef(parsed.ref ?? "");
    setNoteText(parsed.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice.id]);

  const bankAccounts = settings.accounts.filter((a) => a.type === "bank");
  const cashAccount = settings.accounts.find((a) => a.type === "cash") ?? settings.accounts[0];

  const total = Number(invoice.total);
  const net = kind === "sale" ? total - discount : total;
  const due = Math.max(0, net - paid);

  const save = useMutation({
    mutationFn: async () => {
      if (discount < 0 || paid < 0) throw new Error("قيمة غير صالحة");
      if (kind === "sale" && discount > total) throw new Error("الخصم أكبر من الإجمالي");

      // Resolve account depending on method: bank uses selected account name,
      // cash falls back to primary cash account.
      const acc = method === "bank"
        ? (accountName ? { name: accountName } : bankAccounts[0])
        : cashAccount;
      const ref = method === "bank" ? txRef.trim() : "";
      const finalNotes = acc ? encodeNotes(acc.name, noteText, ref) : (noteText || null);

      const patch: Record<string, unknown> = {
        paid,
        payment_method: method,
        account_name: acc?.name ?? null,
        notes: finalNotes || null,
      };
      if (kind === "sale") patch.discount = discount;

      const table = kind === "sale" ? "sales" : "purchases";
      const { error } = await supabase.from(table).update(patch).eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الفاتورة");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="تعديل الفاتورة"
      footer={<>
        <Btn variant="outline" onClick={onClose}>إلغاء</Btn>
        <Btn onClick={() => save.mutate()} disabled={save.isPending}>حفظ التعديلات</Btn>
      </>}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          يمكن تعديل الخصم والدفع وطريقة الدفع والملاحظات فقط. الأصناف والكميات لا تُعدَّل حفاظاً على المخزون.
        </p>

        {kind === "sale" && (
          <Field label="الخصم">
            <Input type="number" step="0.01" min={0} max={total} value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        )}

        <Field label="المدفوع">
          <div className="flex gap-2">
            <Input type="number" step="0.01" min={0} value={paid}
              onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))} />
            <Btn variant="outline" type="button" onClick={() => setPaid(net)} className="shrink-0 text-xs px-3">دفع كامل</Btn>
          </div>
        </Field>

        <Field label="طريقة الدفع">
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "bank"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`h-10 rounded-lg border text-sm font-medium ${method === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {m === "cash" ? "💵 نقدي" : "🏦 بنكي"}
              </button>
            ))}
          </div>
        </Field>

        {method === "bank" && (
          <>
            <Field label="الحساب البنكي">
              <div className="grid grid-cols-3 gap-2">
                {bankAccounts.map((a) => (
                  <button key={a.id} type="button" onClick={() => setAccountName(a.name)}
                    className={`h-9 rounded-lg border text-xs font-medium ${accountName === a.name ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="رقم العملية">
              <Input value={txRef} onChange={(e) => setTxRef(e.target.value)} dir="ltr" className="font-mono text-right" />
            </Field>
          </>
        )}

        <Field label="ملاحظات">
          <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        </Field>

        <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">الصافي</span><span className="font-medium">{net.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المتبقي</span><span className={`font-bold ${due > 0 ? "text-destructive" : "text-success"}`}>{due.toFixed(2)}</span></div>
        </div>
      </div>
    </Modal>
  );
}
