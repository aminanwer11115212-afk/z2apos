export type PaymentMethod = "cash" | "bank" | "transfer" | "wallet" | "credit";

// Methods shown in the POS UI (kept minimal per user request).
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "نقدي", icon: "💵" },
  { value: "bank", label: "بنكي", icon: "🏦" },
];

// Full label lookup (includes legacy values used by older invoices).
const ALL_LABELS: Record<PaymentMethod, { label: string; icon: string }> = {
  cash: { label: "نقدي", icon: "💵" },
  bank: { label: "بنكي", icon: "🏦" },
  transfer: { label: "تحويل", icon: "🔁" },
  wallet: { label: "محفظة", icon: "📱" },
  credit: { label: "آجل", icon: "📝" },
};

export function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return ALL_LABELS[m as PaymentMethod]?.label ?? "—";
}
export function paymentMethodIcon(m: string | null | undefined): string {
  if (!m) return "";
  return ALL_LABELS[m as PaymentMethod]?.icon ?? "";
}
