import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Modal, Field, Input, Btn } from "@/components/ui-kit";
import { useSettings, parseNotes, encodeNotes } from "@/lib/settings";
import { PaymentMethod } from "@/lib/payments";
import { toast } from "sonner";

type Kind = "sale" | "purchase";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  invoice: {
    id: string;
    total: number;
    discount?: number;
    paid: number;
    payment_method: string | null;
    account_name: string | null;
    notes: string | null;
  };
};

const METHOD_META: Record<PaymentMethod, { icon: string; label: string }> = {
  cash: { icon: "💵", label: "نقدي" },
  bank: { icon: "🏦", label: "بنكي" },
  wallet: { icon: "📱", label: "محفظة" },
  transfer: { icon: "🔁", label: "تحويل" },
  credit: { icon: "📝", label: "آجل" },
};

export function EditInvoiceDialog({ open, onClose, kind, invoice }: Props) {
  const qc = useQueryClient();
  const settings = useSettings();
  const parsed = parseNotes(invoice.notes);

  const [discount, setDiscount] = useState(Number(invoice.discount ?? 0));
  const [paid, setPaid] = useState(Number(invoice.paid));
  const [method, setMethod] = useState<PaymentMethod>((invoice.payment_method as PaymentMethod) ?? "cash");
  const [accountName, setAccountName] = useState<string>(invoice.account_name ?? parsed.account ?? "");
  const [txRef, setTxRef] = useState<string>(parsed.ref ?? "");
  const [noteText, setNoteText] = useState<string>(parsed.text);

  useEffect(() => {
    if (!open) return;
    setDiscount(Number(invoice.discount ?? 0));
    setPaid(Number(invoice.paid));
    setMethod((invoice.payment_method as PaymentMethod) ?? "cash");
    setAccountName(invoice.account_name ?? parsed.account ?? "");
    setTxRef(parsed.ref ?? "");
    setNoteText(parsed.text);
  }, [open, invoice.id, invoice.discount, invoice.paid, invoice.payment_method, invoice.account_name, parsed.account, parsed.ref, parsed.text]);

  const digitalAccounts = settings.accounts.filter((a) => a.type === "bank" || a.type === "wallet");
  const cashAccount = settings.accounts.find((a) => a.type === "cash") ?? settings.accounts[0];
  const isDigital = method === "bank" || method === "wallet";

  const total = Number(invoice.total);
  const net = kind === "sale" ? total - discount : total;
  const due = Math.max(0, net - paid);

  const save = useMutation({
    mutationFn: async () => {
      if (discount < 0 || paid < 0) throw new Error("قيمة غير صالحة");
      if (kind === "sale" && discount > total) throw new Error("الخصم أكبر من الإجمالي");
      const acc = isDigital ? (accountName ? { name: accountName } : digitalAccounts[0]) : cashAccount;
      const ref = isDigital ? txRef.trim() : "";
      const finalNotes = acc ? encodeNotes(acc.name, noteText, ref) : (noteText || null);
      const basePatch = { paid, payment_method: method, account_name: acc?.name ?? null, notes: finalNotes || null };
      if (kind === "sale") {
        const { error } = await supabase.from("sales").update({ ...basePatch, discount }).eq("id", invoice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("purchases").update(basePatch).eq("id", invoice.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("تم تحديث الفاتورة"); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="تعديل الفاتورة"
      footer={<>
        <Btn variant="outline" onClick={onClose}>إلغاء</Btn>
        <Btn onClick={() => save.mutate()} disabled={save.isPending}>حفظ التعديلات</Btn>
      </>}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">يمكن تعديل الخصم والدفع وطريقة الدفع والملاحظات فقط. الأصناف والكميات لا تُعدَّل حفاظاً على المخزون.</p>

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
          <div className="grid grid-cols-3 gap-2">
            {(["cash", "bank", "wallet"] as PaymentMethod[]).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`h-10 rounded-lg border text-sm font-medium ${method === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {METHOD_META[m].icon} {METHOD_META[m].label}
              </button>
            ))}
          </div>
        </Field>

        {isDigital && (
          <>
            <Field label={method === "bank" ? "الحساب البنكي" : "الحساب الإلكتروني"}>
              <div className="grid grid-cols-3 gap-2">
                {digitalAccounts.map((a) => (
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
