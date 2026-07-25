import { createFileRoute } from "@tanstack/react-router";
import { usePos } from "@/hooks/usePos";
import { PosLayout } from "@/components/PosLayout";

export const Route = createFileRoute("/_authenticated/sales/new")({
  head: () => ({ meta: [{ title: "بيع سريع — 2A" }] }),
  component: NewSale,
});

function NewSale() {
  const pos = usePos();

  return (
    <PosLayout
      q={pos.q} setQ={pos.setQ} searchRef={pos.searchRef} onSearchKey={pos.onSearchKey}
      parts={pos.parts} onAdd={pos.addPart}
      lines={pos.lines} canEditPrice={pos.canEditPrice} onQty={pos.setQty} onPrice={pos.setPrice} onRemove={pos.remove}
      customers={pos.customers} customerId={pos.customerId} onCustomerId={pos.setCustomerId} onAddCustomer={pos.custDialog.open} customerRef={pos.customerRef}
      paymentMethod={pos.paymentMethod} onPaymentMethod={pos.setPaymentMethod} methodRef={pos.methodRef}
      bankAccountId={pos.bankAccountId} onBankAccountId={pos.setBankAccountId} accountRef={pos.accountRef}
      txRef={pos.txRef} onTxRef={pos.setTxRef}
      discount={pos.discount} onDiscount={pos.setDiscount}
      paid={pos.paid} onPaid={pos.setPaid}
      notes={pos.notes} onNotes={pos.setNotes}
      total={pos.total} settings={pos.settings} isSeller={pos.isSeller} accounts={pos.accounts} lines={pos.lines}
      onPayFull={pos.payFull} onHold={pos.hold} onClear={pos.clear} onSave={() => pos.save.mutate()} savePending={pos.save.isPending}
      holdOpen={pos.holdOpen} setHoldOpen={pos.setHoldOpen} held={pos.held} onResume={pos.resume} onDrop={pos.dropHeld}
      custDialog={pos.custDialog}
    />
  );
}
