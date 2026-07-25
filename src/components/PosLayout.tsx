import { PageHeader, Btn } from "@/components/ui-kit";
import { PosProductGrid } from "./PosProductGrid";
import { PosCart } from "./PosCart";
import { PosSidebar } from "./PosSidebar";
import { PosCustomerDialog } from "./PosCustomerDialog";
import { PosHeldDialog } from "./PosHeldDialog";
import { Search, Keyboard, Play } from "lucide-react";
import type { PosPart, PosLine, HeldSale } from "@/lib/pos";
import type { Settings } from "@/lib/settings";
import type { PaymentMethod } from "@/lib/payments";

type Customer = { id: string; name: string; phone: string | null };
type Account = { id: string; name: string; type: "cash" | "bank" | "wallet" };

type PosLayoutProps = {
  q: string; setQ: (v: string) => void; searchRef: React.RefObject<HTMLInputElement>; onSearchKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  parts: PosPart[]; onAdd: (p: PosPart) => void;
  lines: PosLine[]; canEditPrice: boolean; onQty: (id: string, qty: number) => void; onPrice: (id: string, price: number) => void; onRemove: (id: string) => void;
  customers: Customer[]; customerId: string; onCustomerId: (id: string) => void; onAddCustomer: () => void; customerRef: React.RefObject<HTMLSelectElement>;
  paymentMethod: PaymentMethod; onPaymentMethod: (m: PaymentMethod) => void; methodRef: React.RefObject<HTMLButtonElement>;
  bankAccountId: string; onBankAccountId: (id: string) => void; accountRef: React.RefObject<HTMLDivElement>;
  txRef: string; onTxRef: (v: string) => void;
  discount: number; onDiscount: (v: number) => void;
  paid: number; onPaid: (v: number) => void;
  notes: string; onNotes: (v: string) => void;
  total: number; settings: Settings; isSeller: boolean; accounts: Account[];
  onPayFull: () => void; onHold: () => void; onClear: () => void; onSave: () => void; savePending: boolean;
  holdOpen: boolean; setHoldOpen: (v: boolean) => void; held: HeldSale[]; onResume: (h: HeldSale) => void; onDrop: (id: string) => void;
  custDialog: { isOpen: boolean; close: () => void; form: { name: string; phone: string }; setForm: (v: { name: string; phone: string }) => void; save: { mutate: () => void; isPending: boolean } };
};

export function PosLayout(props: PosLayoutProps) {
  return (
    <div className="p-3 lg:p-4 max-w-6xl mx-auto">
      <PageHeader title="بيع سريع" actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => props.setHoldOpen(true)} className="relative h-8 px-2.5 rounded-lg border text-xs font-medium hover:bg-muted flex items-center gap-1">
            <Play className="w-3.5 h-3.5" />المعلّقة
            {props.held.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{props.held.length}</span>}
          </button>
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground"><Keyboard className="w-3.5 h-3.5" /><span>F2 بحث · F4 عميل · F6 حساب · F7 دفع · F8 تعليق · F9 حفظ</span></div>
        </div>
      } />

      <div className="grid lg:grid-cols-[1fr,320px] gap-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2 h-11 px-3 rounded-xl border bg-card">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input ref={props.searchRef} value={props.q} onChange={(e) => props.setQ(e.target.value)} onKeyDown={props.onSearchKey}
              placeholder="ابحث بكود القطعة أو اسمها (F2)..." className="flex-1 bg-transparent outline-none text-sm" />
            {props.q && <button onClick={() => props.setQ("")} className="text-xs text-muted-foreground">✕</button>}
            <span className="text-xs text-muted-foreground shrink-0">{props.parts.length} صنف</span>
          </div>
          <PosProductGrid parts={props.parts} q={props.q} onAdd={props.onAdd} />
          <PosCart lines={props.lines} parts={props.parts} canEditPrice={props.canEditPrice} onQty={props.onQty} onPrice={props.onPrice} onRemove={props.onRemove} />
          {props.lines.length === 0 && (
            <div className="text-center p-8 text-muted-foreground border rounded-xl bg-card">
              <div className="mb-2">ابدأ بإضافة أصناف من البحث أو اختيار صنف سريع</div>
              <Btn onClick={() => props.searchRef.current?.focus()}><Search className="w-4 h-4 inline ml-1" />بحث</Btn>
            </div>
          )}
        </div>

        <PosSidebar
          customers={props.customers} customerId={props.customerId} onCustomerId={props.onCustomerId} onAddCustomer={props.onAddCustomer}
          paymentMethod={props.paymentMethod} onPaymentMethod={props.onPaymentMethod}
          bankAccountId={props.bankAccountId} onBankAccountId={props.onBankAccountId}
          txRef={props.txRef} onTxRef={props.onTxRef}
          discount={props.discount} onDiscount={props.onDiscount}
          paid={props.paid} onPaid={props.onPaid}
          notes={props.notes} onNotes={props.onNotes}
          total={props.total} settings={props.settings} isSeller={props.isSeller} accounts={props.accounts} lines={props.lines}
          onPayFull={props.onPayFull} onHold={props.onHold} onClear={props.onClear}
          onSave={props.onSave} savePending={props.savePending}
          customerRef={props.customerRef} methodRef={props.methodRef} accountRef={props.accountRef}
        />
      </div>

      <PosCustomerDialog isOpen={props.custDialog.isOpen} onClose={props.custDialog.close} form={props.custDialog.form} setForm={props.custDialog.setForm} save={props.custDialog.save} />
      <PosHeldDialog open={props.holdOpen} onClose={() => props.setHoldOpen(false)} held={props.held} onResume={props.onResume} onDrop={props.onDrop} />
    </div>
  );
}
