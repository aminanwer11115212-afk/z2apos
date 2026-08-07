import { Field, Btn } from "@/components/ui-kit";
import { formatSDG } from "@/lib/auth";
import { computeTax, Settings, Account } from "@/lib/settings";
import { PaymentMethod } from "@/lib/payments";
import { UserPlus, CheckCircle2, Pause } from "lucide-react";
import { useMemo } from "react";

type PosSidebarProps = {
  customers: { id: string; name: string; phone: string | null }[];
  customerId: string;
  onCustomerId: (id: string) => void;
  onAddCustomer: () => void;
  paymentMethod: PaymentMethod;
  onPaymentMethod: (m: PaymentMethod) => void;
  bankAccountId: string;
  onBankAccountId: (id: string) => void;
  txRef: string;
  onTxRef: (v: string) => void;
  discount: number;
  onDiscount: (v: number) => void;
  paid: number;
  onPaid: (v: number) => void;
  notes: string;
  onNotes: (v: string) => void;
  total: number;
  settings: Settings;
  isSeller: boolean;
  accounts: Account[];
  lines: { qty: number; unit_price: number; part: { id: string } }[];
  onPayFull: () => void;
  onHold: () => void;
  onClear: () => void;
  onSave: () => void;
  savePending: boolean;
  accountRef: React.RefObject<HTMLDivElement | null>;
  customerRef: React.RefObject<HTMLSelectElement | null>;
  methodRef: React.RefObject<HTMLButtonElement | null>;
};

const methodMeta: Record<PaymentMethod, { icon: string; label: string }> = {
  cash: { icon: "💵", label: "نقدي" },
  bank: { icon: "🏦", label: "بنكي" },
  wallet: { icon: "📱", label: "محفظة" },
  transfer: { icon: "🔁", label: "تحويل" },
  credit: { icon: "📝", label: "آجل" },
};

export function PosSidebar(props: PosSidebarProps) {
  const {
    customers,
    customerId,
    onCustomerId,
    onAddCustomer,
    paymentMethod,
    onPaymentMethod,
    bankAccountId,
    onBankAccountId,
    txRef,
    onTxRef,
    discount,
    onDiscount,
    paid,
    onPaid,
    notes,
    onNotes,
    total,
    settings,
    isSeller,
    accounts,
    lines,
    onPayFull,
    onHold,
    onClear,
    onSave,
    savePending,
    accountRef,
    customerRef,
    methodRef,
  } = props;

  const isDigital = paymentMethod === "bank" || paymentMethod === "wallet";
  const digitalAccounts = useMemo(
    () => accounts.filter((a) => a.type === "bank" || a.type === "wallet"),
    [accounts],
  );
  const cashAccount = useMemo(
    () => accounts.find((a) => a.type === "cash") ?? accounts[0],
    [accounts],
  );
  const enabledMethods = useMemo(
    () =>
      (Object.keys(settings.paymentMethods) as PaymentMethod[]).filter(
        (k) => settings.paymentMethods[k]?.enabled,
      ),
    [settings.paymentMethods],
  );
  const maxDiscPct = isSeller ? settings.sellerPerms.maxDiscountPercent : 100;
  const maxDiscount = total * (maxDiscPct / 100);
  const effectiveDiscount = Math.min(discount, maxDiscount);
  const net = Math.max(0, total - effectiveDiscount);
  const tax = computeTax(net, settings);
  const due = Math.max(0, tax.grand - paid);

  return (
    <aside className="bg-card border rounded-xl p-3 space-y-2 h-fit lg:sticky lg:top-16 text-sm">
      <Field label="العميل (F4)">
        <div className="flex gap-1">
          <select
            ref={customerRef}
            value={customerId}
            onChange={(e) => onCustomerId(e.target.value)}
            className="flex-1 h-10 px-2 rounded-lg border bg-background text-sm"
          >
            <option value="">— بيع نقدي —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddCustomer}
            title="عميل جديد سريع"
            className="w-10 h-10 rounded-lg border hover:bg-muted flex items-center justify-center"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      </Field>

      <Field label="طريقة الدفع (F7)">
        <div
          className={`grid gap-1`}
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, enabledMethods.length)}, minmax(0, 1fr))`,
          }}
        >
          {enabledMethods.map((m, i) => {
            const meta = methodMeta[m];
            return (
              <button
                key={m}
                type="button"
                ref={i === 0 ? methodRef : undefined}
                onClick={() => onPaymentMethod(m)}
                className={`h-10 rounded-lg border text-sm font-medium ${paymentMethod === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      </Field>

      {isDigital && (
        <>
          <Field label={paymentMethod === "bank" ? "الحساب البنكي (F6)" : "الحساب الإلكتروني (F6)"}>
            <div ref={accountRef} tabIndex={-1} className="grid grid-cols-3 gap-1 outline-none">
              {digitalAccounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onBankAccountId(a.id)}
                  className={`h-9 rounded-lg border text-xs font-medium ${bankAccountId === a.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="رقم العملية">
            <input
              value={txRef}
              onChange={(e) => onTxRef(e.target.value)}
              placeholder="اختياري"
              className="w-full h-10 px-2 rounded-lg border bg-background text-sm font-mono"
              dir="ltr"
            />
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label={`خصم${isSeller && maxDiscPct < 100 ? ` (حد ${maxDiscPct}%)` : ""}`}>
          <input
            type="number"
            step="0.01"
            value={discount}
            onChange={(e) => onDiscount(Math.min(Number(e.target.value) || 0, maxDiscount))}
            className="w-full h-10 px-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="مدفوع">
          <input
            type="number"
            step="0.01"
            value={paid}
            onChange={(e) => onPaid(Number(e.target.value) || 0)}
            className="w-full h-10 px-2 rounded-lg border bg-background text-sm"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={onPayFull}
        disabled={tax.grand <= 0}
        className="w-full h-9 rounded-lg border border-success/40 bg-success/10 text-success text-xs font-medium hover:bg-success/20 disabled:opacity-40 flex items-center justify-center gap-1"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        دفع كامل ({formatSDG(tax.grand)})
      </button>

      <Field label="ملاحظات">
        <input
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          className="w-full h-10 px-2 rounded-lg border bg-background text-sm"
        />
      </Field>

      <div className="border-t pt-2 space-y-1 text-xs">
        <Row label="الإجمالي" value={formatSDG(total)} />
        <Row label="الخصم" value={`- ${formatSDG(effectiveDiscount)}`} />
        {settings.taxEnabled && settings.taxPercent > 0 && (
          <Row label={`الضريبة (${settings.taxPercent}%)`} value={`+ ${formatSDG(tax.amount)}`} />
        )}
        <Row label="المدفوع" value={`- ${formatSDG(paid)}`} />
        <div className="flex justify-between font-bold text-sm pt-1 border-t">
          <span>المتبقي</span>
          <span className={due > 0 ? "text-destructive" : "text-success"}>{formatSDG(due)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Btn variant="outline" onClick={onClear} className="h-9 text-sm px-3">
          مسح
        </Btn>
        <Btn
          variant="outline"
          onClick={onHold}
          disabled={lines.length === 0}
          className="h-9 text-sm px-3"
          title="F8"
        >
          <Pause className="w-3.5 h-3.5 inline ml-1" />
          تعليق
        </Btn>
        <Btn
          onClick={onSave}
          disabled={savePending || lines.length === 0}
          className="flex-1 h-9 text-sm"
        >
          حفظ (F9)
        </Btn>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
