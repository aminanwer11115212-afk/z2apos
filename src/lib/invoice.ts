/**
 * Formatting helpers for the printed invoice.
 *
 * The document deliberately prints Latin digits with grouped thousands
 * (`80,391.00`) instead of the app's `formatSDG`, which renders Arabic-Indic
 * digits: the printed template — and the thermal printers that receive it —
 * are read as accounting figures, and narrow receipts fit far more of them.
 */

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return AMOUNT.format(Number.isFinite(v) ? v : 0);
}

/** Quantities keep their decimals only when they have any (2 → "2", 1.5 → "1.5"). */
export function formatQty(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** `09 / 07 / 2026` — day / month / year, matching the printed template. */
export function formatInvoiceDate(d: string | number | Date): string {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())} / ${p(dt.getMonth() + 1)} / ${dt.getFullYear()}`;
}

export function formatInvoiceTime(d: string | number | Date): string {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export type InvoiceItem = {
  id: string;
  name: string;
  code?: string | null;
  qty: number;
  unit_price: number;
  subtotal: number;
};

export type InvoiceDoc = {
  invoiceLabel: string;
  date: string | number | Date;
  customerName: string;
  customerPhone?: string | null;
  items: InvoiceItem[];
  total: number;
  discount: number;
  tax: number;
  net: number;
  grand: number;
  paid: number;
  due: number;
  paymentMethod?: string | null;
  accountName?: string | null;
  txRef?: string | null;
  notes?: string;
  /** Customer balance after this invoice, when there is an account to show. */
  customerBalance?: number | null;
};
