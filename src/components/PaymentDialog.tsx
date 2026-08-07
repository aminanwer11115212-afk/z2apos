import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Modal, Field, Input, Btn } from "@/components/ui-kit";
import { useSettings, type PaymentMethodKey } from "@/lib/settings";
import { formatSDG } from "@/lib/auth";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  direction: "in" | "out";
  party: { id: string; name: string; balance: number };
  saleId?: string;
  purchaseId?: string;
  suggested?: number;
};

const METHOD_META: Partial<Record<PaymentMethodKey, { label: string; icon: string }>> = {
  cash: { label: "نقدي", icon: "💵" },
  bank: { label: "بنكي", icon: "🏦" },
  wallet: { label: "محفظة", icon: "📱" },
};

export function PaymentDialog({
  open,
  onClose,
  direction,
  party,
  saleId,
  purchaseId,
  suggested,
}: Props) {
  const qc = useQueryClient();
  const settings = useSettings();

  const enabledMethods = (Object.keys(settings.paymentMethods) as PaymentMethodKey[]).filter(
    (k) => settings.paymentMethods[k]?.enabled,
  );
  const initialMethod: PaymentMethodKey = enabledMethods.includes(settings.defaultMethod)
    ? settings.defaultMethod
    : (enabledMethods[0] ?? "cash");

  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethodKey>(initialMethod);
  const [accountId, setAccountId] = useState(
    settings.paymentMethods[initialMethod]?.defaultAccountId ?? "",
  );
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(suggested ?? Math.max(0, Number(party.balance) || 0));
      setMethod(initialMethod);
      setAccountId(settings.paymentMethods[initialMethod]?.defaultAccountId ?? "");
      setTxRef("");
      setNotes("");
    }
  }, [open, suggested, party.balance, initialMethod, settings.paymentMethods]);

  useEffect(() => {
    if (!open) return;
    setAccountId(settings.paymentMethods[method]?.defaultAccountId ?? "");
  }, [method, open, settings.paymentMethods]);

  const cfg = settings.paymentMethods[method];
  const acc = settings.accounts.find((a) => a.id === accountId);
  const isDigital = method === "bank" || method === "wallet";
  const requireRef = isDigital && !!cfg?.requireRef;

  const projectedBalance = Number(party.balance) - amount;

  const save = useMutation({
    mutationFn: async () => {
      if (!(amount > 0)) throw new Error("أدخل مبلغاً صحيحاً");
      if (requireRef && !txRef.trim()) throw new Error("رقم العملية مطلوب لهذه الطريقة");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const finalNotes =
        [txRef.trim() ? `مرجع: ${txRef.trim()}` : "", notes.trim()].filter(Boolean).join(" · ") ||
        null;
      const payload = {
        direction,
        amount,
        method,
        account_name: acc?.name ?? null,
        notes: finalNotes,
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
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !(amount > 0)}>
            حفظ
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-muted/50 text-sm flex items-center justify-between">
          <span className="text-muted-foreground">الرصيد الحالي</span>
          <span
            className={`font-bold ${Number(party.balance) > 0 ? "text-destructive" : Number(party.balance) < 0 ? "text-success" : ""}`}
          >
            {formatSDG(party.balance)}
            {Number(party.balance) < 0 ? " (فائض)" : ""}
          </span>
        </div>

        <Field label="المبلغ *">
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            autoFocus
          />
        </Field>

        {amount > 0 && (
          <div className="text-xs text-muted-foreground px-1">
            الرصيد بعد الحفظ:{" "}
            <span
              className={`font-semibold ${projectedBalance > 0 ? "text-destructive" : projectedBalance < 0 ? "text-success" : "text-foreground"}`}
            >
              {formatSDG(Math.abs(projectedBalance))}
              {projectedBalance > 0 ? " (مدين)" : projectedBalance < 0 ? " (دائن — فائض)" : ""}
            </span>
          </div>
        )}

        <Field label="طريقة الدفع">
          <div
            className={`grid gap-1.5`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, enabledMethods.length)}, minmax(0, 1fr))`,
            }}
          >
            {enabledMethods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`h-10 rounded-lg border text-sm font-medium ${method === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
              >
                {METHOD_META[m]?.icon} {METHOD_META[m]?.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="الحساب">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border bg-background"
          >
            {settings.accounts
              .filter((a) =>
                method === "cash" ? a.type === "cash" : a.type === "bank" || a.type === "wallet",
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.type === "cash" ? "💵" : a.type === "wallet" ? "📱" : "🏦"} {a.name}
                </option>
              ))}
          </select>
        </Field>

        {isDigital && (
          <Field label={`رقم العملية${requireRef ? " *" : ""}`}>
            <Input
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
              placeholder={requireRef ? "مطلوب" : "اختياري"}
              dir="ltr"
              className="font-mono text-right"
            />
          </Field>
        )}

        <Field label="ملاحظات">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
        </Field>
      </div>
    </Modal>
  );
}
