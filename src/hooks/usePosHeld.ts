import { useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { HeldSale, loadHeld, saveHeld, type PosLine } from "@/lib/pos";
import { toast } from "sonner";
import type { PaymentMethod } from "@/lib/payments";

type UsePosHeldArgs = {
  // Current draft — captured verbatim when the sale is put on hold, so that
  // resuming restores exactly what the cashier had entered.
  lines: PosLine[];
  customerId: string;
  discount: number;
  paid: number;
  notes: string;
  paymentMethod: PaymentMethod;
  bankAccountId: string;
  txRef: string;
  setLines: Dispatch<SetStateAction<PosLine[]>>;
  setCustomerId: Dispatch<SetStateAction<string>>;
  setDiscount: Dispatch<SetStateAction<number>>;
  setPaid: Dispatch<SetStateAction<number>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setPaymentMethod: Dispatch<SetStateAction<PaymentMethod>>;
  setBankAccountId: Dispatch<SetStateAction<string>>;
  setTxRef: Dispatch<SetStateAction<string>>;
  searchRef: RefObject<HTMLInputElement | null>;
};

export function usePosHeld({
  lines,
  customerId,
  discount,
  paid,
  notes,
  paymentMethod,
  bankAccountId,
  txRef,
  setLines,
  setCustomerId,
  setDiscount,
  setPaid,
  setNotes,
  setPaymentMethod,
  setBankAccountId,
  setTxRef,
  searchRef,
}: UsePosHeldArgs) {
  const [held, setHeld] = useState<HeldSale[]>(() => loadHeld());
  const [holdOpen, setHoldOpen] = useState(false);

  const hold = () => {
    if (lines.length === 0) return toast.error("لا توجد أصناف للتعليق");
    const entry: HeldSale = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      lines,
      customerId,
      discount,
      paid,
      notes,
      paymentMethod,
      bankAccountId,
      txRef,
    };
    const nx = [entry, ...held].slice(0, 20);
    setHeld(nx);
    saveHeld(nx);
    setLines([]);
    setDiscount(0);
    setPaid(0);
    setNotes("");
    setCustomerId("");
    setTxRef("");
    toast.success("تم تعليق الفاتورة");
    searchRef.current?.focus();
  };

  const resume = (h: HeldSale) => {
    setLines(h.lines);
    setCustomerId(h.customerId);
    setDiscount(h.discount);
    setPaid(h.paid);
    setNotes(h.notes);
    setPaymentMethod(h.paymentMethod);
    if (h.bankAccountId) setBankAccountId(h.bankAccountId);
    setTxRef(h.txRef ?? "");
    const nx = held.filter((x) => x.id !== h.id);
    setHeld(nx);
    saveHeld(nx);
    setHoldOpen(false);
    toast.success("تم استعادة الفاتورة");
  };

  const dropHeld = (id: string) => {
    const nx = held.filter((x) => x.id !== id);
    setHeld(nx);
    saveHeld(nx);
  };

  return { held, holdOpen, setHoldOpen, hold, resume, dropHeld };
}
