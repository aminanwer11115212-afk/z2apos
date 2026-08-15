import type { Account, Settings } from "@/lib/settings";

export type PaymentMethod = "cash" | "bank" | "transfer" | "wallet" | "credit";

// Methods shown in the POS UI (kept minimal per user request).
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "نقدي", icon: "💵" },
  { value: "bank", label: "بنكي", icon: "🏦" },
];

/**
 * Label/icon for every method, legacy values included.
 * Single source of truth — screens render from this instead of keeping their
 * own copy, so a wording change lands everywhere at once.
 */
export const PAYMENT_META: Record<PaymentMethod, { label: string; icon: string }> = {
  cash: { label: "نقدي", icon: "💵" },
  bank: { label: "بنكي", icon: "🏦" },
  transfer: { label: "تحويل", icon: "🔁" },
  wallet: { label: "محفظة", icon: "📱" },
  credit: { label: "آجل", icon: "📝" },
};

export function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return PAYMENT_META[m as PaymentMethod]?.label ?? "—";
}
export function paymentMethodIcon(m: string | null | undefined): string {
  if (!m) return "";
  return PAYMENT_META[m as PaymentMethod]?.icon ?? "";
}

/** Bank and wallet settle into a digital account and can carry a reference. */
export function isDigitalMethod(m: PaymentMethod): boolean {
  return m === "bank" || m === "wallet";
}

/* ------------------------------------------------------------------ *
 * Settings-driven selection — shared by POS, purchases, the payment
 * dialog and the standalone payment page so they can never drift apart.
 * ------------------------------------------------------------------ */

export function enabledPaymentMethods(s: Settings): PaymentMethod[] {
  return (Object.keys(s.paymentMethods) as PaymentMethod[]).filter(
    (k) => s.paymentMethods[k]?.enabled,
  );
}

/** The configured default, or the first enabled method when it is switched off. */
export function initialPaymentMethod(s: Settings): PaymentMethod {
  const enabled = enabledPaymentMethods(s);
  return enabled.includes(s.defaultMethod) ? s.defaultMethod : (enabled[0] ?? "cash");
}

/** Accounts a method may settle into: cash boxes for cash, bank/wallet otherwise. */
export function accountsForMethod(s: Settings, m: PaymentMethod): Account[] {
  return s.accounts.filter((a) => (m === "cash" ? a.type === "cash" : a.type !== "cash"));
}

/**
 * Account to select when a method is picked: its configured default when that
 * account still fits the method, otherwise the first one that does.
 */
export function defaultAccountIdFor(s: Settings, m: PaymentMethod): string {
  const pool = accountsForMethod(s, m);
  const preferred = s.paymentMethods[m as "cash" | "bank" | "wallet"]?.defaultAccountId;
  return pool.some((a) => a.id === preferred) ? preferred! : (pool[0]?.id ?? "");
}

/** True when the method is configured to demand a transaction reference. */
export function requiresRef(s: Settings, m: PaymentMethod): boolean {
  return isDigitalMethod(m) && !!s.paymentMethods[m as "bank" | "wallet"]?.requireRef;
}
