import { type PaymentMethod } from "@/lib/payments";
import type { Part, PriceMode } from "@/lib/parts";

/** The columns the POS actually selects — kept in step with `Part` by Pick. */
export type PosPart = Pick<
  Part,
  "id" | "code" | "name" | "sell_price" | "wholesale_price" | "quantity"
>;
export const POS_PART_SELECT = "id,code,name,sell_price,wholesale_price,quantity";
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
  priceMode?: PriceMode;
};

export const HOLD_KEY = "2a-held-sales";

export const loadHeld = (): HeldSale[] => {
  try {
    return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveHeld = (list: HeldSale[]) => {
  localStorage.setItem(HOLD_KEY, JSON.stringify(list));
};
