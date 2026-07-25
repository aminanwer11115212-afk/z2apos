import { type PaymentMethod } from "@/lib/payments";

export type PosPart = { id: string; code: string; name: string; sell_price: number; quantity: number };
export type PosLine = { part: PosPart; qty: number; unit_price: number };

export type HeldSale = {
  id: string;
  savedAt: string;
  lines: PosLine[];
  customerId: string;
  discount: number;
  paid: number;
  notes: string;
  paymentMethod: PaymentMethod;
  bankAccountId?: string;
  txRef?: string;
};

export const HOLD_KEY = "2a-held-sales";

export const loadHeld = (): HeldSale[] => {
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]"); } catch { return []; }
};

export const saveHeld = (list: HeldSale[]) => {
  localStorage.setItem(HOLD_KEY, JSON.stringify(list));
};

export const formatSDG = (n: number) =>
  new Intl.NumberFormat("ar-SD", { style: "currency", currency: "SDG", maximumFractionDigits: 2 }).format(n);
