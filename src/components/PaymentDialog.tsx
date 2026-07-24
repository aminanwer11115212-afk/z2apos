import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Modal, Field, Input, Btn } from "@/components/ui-kit";
import { useSettings } from "@/lib/settings";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { formatSDG } from "@/lib/auth";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  direction: "in" | "out"; // in = تحصيل من عميل, out = سداد لمورد
  party: { id: string; name: string; balance: number };
  saleId?: string;
  purchaseId?: string;
  suggested?: number;
};

export function PaymentDialog({ open, onClose, direction, party, saleId, purchaseId, suggested }: Props) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState(settings.defaultAccountId);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(suggested ?? Math.max(0, Number(party.balance) || 0));
      setMethod("cash");
      setAccountId(settings.defaultAccountId);
      setNotes("");
    }
  }, [open, suggested, party.balance, settings.defaultAccountId]);

  const acc = settings.accounts.find((a) => a.id === accountId);

  const save = useMutation({
    mutationFn: async () => {
      if (!(amount > 0)) throw new Error("أدخل مبلغاً صحيحاً");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const payload = {
        direction,
        amount,
        method,
        account_name: acc?.name ?? null,
        notes: notes.trim() || null,
        created_by: uid ?? null,
        customer_id: direction === "in" ? party.id : null,
        supplier_id: direction === "out" ? party.id : null,
        sale_id: saleId ?? null,
        purchase_id: purchaseId ?? null,
      };
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(direction === "in" ? "تم تسجيل التحصيل" : "تم تسجيل السداد");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = direction === "in" ? `تحصيل من ${party.name}` : `سداد إلى ${party.name}`;

  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Btn variant="outline" onClick={onClose}>إلغاء</Btn>
        <Btn onClick={() => save.mutate()} disabled={save.isPending || !(amount > 0)}>حفظ</Btn>
      </>}>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-muted/50 text-sm flex items-center justify-between">
          <span className="text-muted-foreground">الرصيد الحالي</span>
          <span className={`font-bold ${Number(party.balance) > 0 ? "text-destructive" : "text-success"}`}>
            {formatSDG(party.balance)}
          </span>
        </div>

        <Field label="المبلغ *">
          <Input type="number" step="0.01" value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)} autoFocus />
        </Field>

        <Field label="طريقة الدفع">
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                className={`h-10 rounded-lg border text-xs font-medium ${method === m.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </Field>

        {method !== "credit" && (
          <Field label="الحساب">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background">
              {settings.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.type === "cash" ? "💵" : "🏦"} {a.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="ملاحظات">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
        </Field>
      </div>
    </Modal>
  );
}
