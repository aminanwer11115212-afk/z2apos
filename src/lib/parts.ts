/**
 * Shared shapes and pricing maths for قطع الغيار.
 *
 * A part carries three prices: التكلفة (cost), القطاعي (sell_price) and
 * الجملة (wholesale_price). Wholesale is optional — a stored 0 means "غير محدد"
 * and every consumer falls back to the retail price, so switching a whole
 * invoice to جملة never silently sells at zero.
 */

export type Part = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  car_model: string | null;
  cost_price: number;
  sell_price: number;
  wholesale_price: number;
  quantity: number;
  min_quantity: number;
};

export const PART_SELECT =
  "id,code,name,category,car_model,cost_price,sell_price,wholesale_price,quantity,min_quantity";

/** Which of the three prices a bulk edit (or the POS) is working on. */
export type PriceField = "cost_price" | "sell_price" | "wholesale_price";

export const PRICE_LABEL: Record<PriceField, string> = {
  cost_price: "سعر التكلفة",
  sell_price: "السعر القطاعي",
  wholesale_price: "سعر الجملة",
};

export type PriceMode = "retail" | "wholesale";

/** Unit price for a part under the invoice's pricing mode. */
export function unitPriceFor(
  p: { sell_price: number | string; wholesale_price?: number | string | null },
  mode: PriceMode,
): number {
  const retail = Number(p.sell_price) || 0;
  if (mode === "retail") return retail;
  const wholesale = Number(p.wholesale_price ?? 0);
  return wholesale > 0 ? wholesale : retail;
}

export function autoPartCode() {
  return `P${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Bulk pricing
 * ------------------------------------------------------------------ */

export type BulkOp =
  | "increase_percent" // +% على السعر الحالي
  | "decrease_percent" // -% من السعر الحالي
  | "increase_amount" // +مبلغ ثابت
  | "decrease_amount" // -مبلغ ثابت
  | "set" // تعيين قيمة موحّدة
  | "margin_on_cost" // التكلفة + هامش %
  | "copy_from"; // نسخ من حقل سعر آخر (± هامش %)

export const BULK_OPS: { v: BulkOp; label: string; needsValue: boolean }[] = [
  { v: "increase_percent", label: "زيادة بنسبة %", needsValue: true },
  { v: "decrease_percent", label: "تخفيض بنسبة %", needsValue: true },
  { v: "increase_amount", label: "زيادة بمبلغ", needsValue: true },
  { v: "decrease_amount", label: "تخفيض بمبلغ", needsValue: true },
  { v: "set", label: "تعيين سعر موحّد", needsValue: true },
  { v: "margin_on_cost", label: "التكلفة + هامش %", needsValue: true },
  { v: "copy_from", label: "نسخ من سعر آخر + هامش %", needsValue: true },
];

/** Rounding applied after the arithmetic — keeps shelf prices tidy. */
export type RoundMode = "none" | "0.01" | "1" | "5" | "10" | "50" | "100" | "1000";

export const ROUND_MODES: { v: RoundMode; label: string }[] = [
  { v: "none", label: "بدون تقريب" },
  { v: "0.01", label: "قرشين (0.01)" },
  { v: "1", label: "أقرب 1" },
  { v: "5", label: "أقرب 5" },
  { v: "10", label: "أقرب 10" },
  { v: "50", label: "أقرب 50" },
  { v: "100", label: "أقرب 100" },
  { v: "1000", label: "أقرب 1000" },
];

export function roundPrice(n: number, mode: RoundMode): number {
  if (mode === "none") return Math.round(n * 100) / 100;
  const step = Number(mode);
  if (!step || step <= 0) return n;
  return Math.round(n / step) * step;
}

export type BulkPriceInput = {
  op: BulkOp;
  value: number;
  /** Source field for `copy_from` (defaults to cost when absent). */
  source?: PriceField;
  round: RoundMode;
};

/**
 * New value of `target` for one row. Returns a non-negative number; callers
 * decide whether to write it (nothing is persisted here).
 */
export function computeBulkPrice(
  row: Pick<Part, "cost_price" | "sell_price" | "wholesale_price">,
  target: PriceField,
  { op, value, source, round }: BulkPriceInput,
): number {
  const current = Number(row[target]) || 0;
  const v = Number(value) || 0;
  let next = current;
  switch (op) {
    case "increase_percent":
      next = current * (1 + v / 100);
      break;
    case "decrease_percent":
      next = current * (1 - v / 100);
      break;
    case "increase_amount":
      next = current + v;
      break;
    case "decrease_amount":
      next = current - v;
      break;
    case "set":
      next = v;
      break;
    case "margin_on_cost":
      next = (Number(row.cost_price) || 0) * (1 + v / 100);
      break;
    case "copy_from":
      next = (Number(row[source ?? "cost_price"]) || 0) * (1 + v / 100);
      break;
  }
  return Math.max(0, roundPrice(next, round));
}

/** Profit margin over cost, as a percentage. `null` when cost is unknown. */
export function marginPercent(cost: number, price: number): number | null {
  const c = Number(cost) || 0;
  if (c <= 0) return null;
  return ((Number(price) - c) / c) * 100;
}
