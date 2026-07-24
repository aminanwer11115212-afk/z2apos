export type PaymentMethod = "cash" | "bank" | "transfer" | "wallet" | "credit";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "نقدي", icon: "💵" },
  { value: "bank", label: "بنكي", icon: "🏦" },
  { value: "transfer", label: "تحويل", icon: "🔁" },
  { value: "wallet", label: "محفظة إلكترونية", icon: "📱" },
  { value: "credit", label: "آجل", icon: "📝" },
];

export function paymentMethodLabel(m: string | null | undefined): string {
  return PAYMENT_METHODS.find((x) => x.value === m)?.label ?? "—";
}
export function paymentMethodIcon(m: string | null | undefined): string {
  return PAYMENT_METHODS.find((x) => x.value === m)?.icon ?? "";
}
