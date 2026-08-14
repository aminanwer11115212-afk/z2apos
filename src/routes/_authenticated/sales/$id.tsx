import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import type { PrintFormat } from "@/lib/settings";
import {
  useSettings,
  parseNotes,
  saleTotals,
  formatInvoiceNo,
  renderTemplate,
} from "@/lib/settings";
import { whatsappUrl } from "@/lib/utils";
import { Btn } from "@/components/ui-kit";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import type { InvoiceDoc } from "@/lib/invoice";
import { PaymentDialog } from "@/components/PaymentDialog";
import { EditInvoiceDialog } from "@/components/EditInvoiceDialog";
import { PrintFormatPicker } from "@/components/PrintFormatPicker";
import { ArrowRight, Wallet, MessageCircle, Pencil, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales/$id")({
  head: () => ({ meta: [{ title: "فاتورة — 2A" }] }),
  component: SaleView,
  errorComponent: SaleErrorComponent,
  notFoundComponent: () => <div className="p-6 text-center">الفاتورة غير موجودة</div>,
});

// Declared as a real component (capitalised) so the useRouter hook call is valid —
// an inline arrow function here trips the rules-of-hooks contract.
function SaleErrorComponent({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="p-6 text-center">
      <p className="text-destructive">تعذّر تحميل الفاتورة</p>
      <button
        className="mt-4 underline"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

type SaleFull = {
  id: string;
  invoice_no: number;
  total: number;
  discount: number;
  tax_amount: number;
  paid: number;
  created_at: string;
  notes: string | null;
  payment_method: string | null;
  account_name: string | null;
  customer_id: string | null;
  customers: { id: string; name: string; phone: string | null; balance: number } | null;
  sale_items: {
    id: string;
    qty: number;
    unit_price: number;
    subtotal: number;
    parts: { name: string; code: string | null } | null;
  }[];
};

function SaleView() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);
  // The picker overrides the stored default for this print run, and the document
  // re-renders in that format (thermal drops the code column and filler rows).
  const [format, setFormat] = useState<PrintFormat>(settings.printFormat);
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id,invoice_no,total,discount,tax_amount,paid,created_at,notes,payment_method,account_name,customer_id, customers(id,name,phone,balance), sale_items(id,qty,unit_price,subtotal, parts(name,code))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as SaleFull;
    },
  });

  if (isLoading || !data)
    return <div className="p-6 text-center text-muted-foreground">جارٍ التحميل…</div>;

  // Tax comes from the invoice, not from current settings — see saleTotals.
  const { net, tax, grand } = saleTotals(data);
  const due = grand - Number(data.paid);
  const parsed = parseNotes(data.notes);
  const doc: InvoiceDoc = {
    invoiceLabel: formatInvoiceNo(data.invoice_no, settings),
    date: data.created_at,
    customerName: data.customers?.name ?? "نقدي",
    customerPhone: data.customers?.phone ?? null,
    items: data.sale_items.map((it) => ({
      id: it.id,
      name: it.parts?.name ?? "—",
      code: it.parts?.code ?? null,
      qty: Number(it.qty),
      unit_price: Number(it.unit_price),
      subtotal: Number(it.subtotal),
    })),
    total: Number(data.total),
    discount: Number(data.discount),
    tax,
    net,
    grand,
    paid: Number(data.paid),
    due,
    paymentMethod: data.payment_method,
    accountName: data.account_name ?? parsed.account,
    txRef: parsed.ref,
    notes: parsed.text,
    customerBalance: data.customers ? Number(data.customers.balance) : null,
  };
  const isThermal = format !== "a4";
  const containerMax = isThermal ? "max-w-sm" : "max-w-4xl";
  const invoiceLabel = doc.invoiceLabel;

  const shareWhatsApp = () => {
    const phone = data.customers?.phone;
    if (!phone) return;
    const msg = renderTemplate(settings.waInvoiceTemplate, {
      name: data.customers?.name ?? "",
      invoice: invoiceLabel,
      total: formatSDG(grand),
      due: formatSDG(Math.max(0, due)),
      store: settings.storeName,
      balance: formatSDG(Number(data.customers?.balance ?? 0)),
    });
    window.open(whatsappUrl(phone, msg), "_blank");
  };

  return (
    <div className={`p-4 lg:p-6 ${containerMax} mx-auto`}>
      <div className="flex items-center justify-between mb-4 no-print gap-2 flex-wrap">
        <Link
          to="/sales"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للفواتير
        </Link>
        <div className="flex gap-2 flex-wrap items-center">
          {data.customers && Number(data.customers.balance) < 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
              للعميل رصيد فائض: {formatSDG(Math.abs(Number(data.customers.balance)))}
            </span>
          )}
          <Btn variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 inline ml-1" />
            تعديل
          </Btn>
          {due > 0 && data.customers && (
            <>
              <Link to="/sales/$id/pay" params={{ id }}>
                <Btn variant="outline">
                  <ExternalLink className="w-4 h-4 inline ml-1" />
                  صفحة دفع
                </Btn>
              </Link>
              <Btn variant="outline" onClick={() => setPayOpen(true)}>
                <Wallet className="w-4 h-4 inline ml-1" />
                تحصيل ({formatSDG(due)})
              </Btn>
            </>
          )}
          {data.customers?.phone && (
            <Btn variant="outline" onClick={shareWhatsApp}>
              <MessageCircle className="w-4 h-4 inline ml-1" />
              واتساب
            </Btn>
          )}
          <PrintFormatPicker value={format} onChange={setFormat} />
        </div>
      </div>

      {/* settings.printCopies: extra copies are screen-hidden and each starts a new sheet. */}
      {Array.from({ length: Math.max(1, Number(settings.printCopies) || 1) }, (_, copy) => (
        <div key={copy} className={copy > 0 ? "print-copy" : undefined}>
          <InvoiceDocument
            doc={doc}
            settings={settings}
            format={format}
            copyLabel={copy > 0 ? `نسخة ${copy + 1}` : undefined}
          />
        </div>
      ))}

      {data.customers && (
        <PaymentDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          direction="in"
          party={{
            id: data.customers.id,
            name: data.customers.name,
            balance: Number(data.customers.balance),
          }}
          saleId={data.id}
          suggested={due}
        />
      )}

      <EditInvoiceDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        kind="sale"
        invoice={{
          id: data.id,
          total: Number(data.total),
          discount: Number(data.discount),
          tax_amount: Number(data.tax_amount ?? 0),
          paid: Number(data.paid),
          payment_method: data.payment_method,
          account_name: data.account_name,
          notes: data.notes,
        }}
      />
    </div>
  );
}
