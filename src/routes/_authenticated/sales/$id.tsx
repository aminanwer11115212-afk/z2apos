import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings, parseNotes, computeTax, formatInvoiceNo, renderTemplate } from "@/lib/settings";
import { paymentMethodLabel, paymentMethodIcon } from "@/lib/payments";
import { whatsappUrl } from "@/lib/utils";
import { Btn } from "@/components/ui-kit";
import { PaymentDialog } from "@/components/PaymentDialog";
import { EditInvoiceDialog } from "@/components/EditInvoiceDialog";
import { PrintFormatPicker } from "@/components/PrintFormatPicker";
import { Logo } from "@/components/Logo";
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
      <button className="mt-4 underline" onClick={() => { router.invalidate(); reset(); }}>إعادة المحاولة</button>
    </div>
  );
}

type SaleFull = {
  id: string; invoice_no: number; total: number; discount: number; paid: number;
  created_at: string; notes: string | null;
  payment_method: string | null; account_name: string | null;
  customer_id: string | null;
  customers: { id: string; name: string; phone: string | null; balance: number } | null;
  sale_items: { id: string; qty: number; unit_price: number; subtotal: number;
    parts: { name: string; code: string | null } | null }[];
};

function SaleView() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id,invoice_no,total,discount,paid,created_at,notes,payment_method,account_name,customer_id, customers(id,name,phone,balance), sale_items(id,qty,unit_price,subtotal, parts(name,code))")
        .eq("id", id).single();
      if (error) throw error;
      return data as unknown as SaleFull;
    },
  });

  if (isLoading || !data) return <div className="p-6 text-center text-muted-foreground">جارٍ التحميل…</div>;

  const net = Number(data.total) - Number(data.discount);
  const tax = computeTax(net, settings);
  const grand = tax.grand;
  const due = grand - Number(data.paid);
  const parsed = parseNotes(data.notes);
  const isThermal = settings.printFormat !== "a4";
  const containerMax = isThermal ? "max-w-sm" : "max-w-3xl";
  const invoiceLabel = formatInvoiceNo(data.invoice_no, settings);

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
        <Link to="/sales" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />العودة للفواتير
        </Link>
        <div className="flex gap-2 flex-wrap items-center">
          {data.customers && Number(data.customers.balance) < 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
              للعميل رصيد فائض: {formatSDG(Math.abs(Number(data.customers.balance)))}
            </span>
          )}
          <Btn variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 inline ml-1" />تعديل
          </Btn>
          {due > 0 && data.customers && (
            <>
              <Link to="/sales/$id/pay" params={{ id }}>
                <Btn variant="outline">
                  <ExternalLink className="w-4 h-4 inline ml-1" />صفحة دفع
                </Btn>
              </Link>
              <Btn variant="outline" onClick={() => setPayOpen(true)}>
                <Wallet className="w-4 h-4 inline ml-1" />تحصيل ({formatSDG(due)})
              </Btn>
            </>
          )}
          {data.customers?.phone && (
            <Btn variant="outline" onClick={shareWhatsApp}>
              <MessageCircle className="w-4 h-4 inline ml-1" />واتساب
            </Btn>
          )}
          <PrintFormatPicker initial={settings.printFormat} />
        </div>
      </div>

      <div className={`print-area bg-card border rounded-2xl p-6 shadow-sm ${isThermal ? "text-xs" : ""}`}>
        <div className="flex flex-col items-center text-center gap-2 pb-3 border-b">
          {settings.showLogo && <Logo variant="light" className={isThermal ? "h-12 w-auto" : "h-16 w-auto"} />}
          <div className={`font-bold ${isThermal ? "text-base" : "text-2xl"}`}>{settings.storeName || "نظام 2A"}</div>
          <div className="text-xs muted-print text-muted-foreground font-semibold tracking-wide">فاتورة مبيعات</div>
        </div>

        <div className="grid grid-cols-2 gap-3 py-3 text-sm">
          <div>
            <div className="muted-print text-muted-foreground text-xs">رقم الفاتورة</div>
            <div className="font-bold font-mono">{invoiceLabel}</div>
          </div>
          <div className="text-left">
            <div className="muted-print text-muted-foreground text-xs">التاريخ</div>
            <div className="font-semibold">
              {new Date(data.created_at).toLocaleString("ar-SD", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
          <div>
            <div className="muted-print text-muted-foreground text-xs">العميل</div>
            <div className="font-semibold">{data.customers?.name ?? "نقدي"}</div>
            {data.customers?.phone && <div className="text-xs muted-print text-muted-foreground">{data.customers.phone}</div>}
          </div>
          <div className="text-left">
            {data.payment_method && (
              <>
                <div className="muted-print text-muted-foreground text-xs">طريقة الدفع</div>
                <div className="font-semibold">
                  {paymentMethodIcon(data.payment_method)} {paymentMethodLabel(data.payment_method)}
                  {(data.account_name || parsed.account) && <span className="muted-print text-muted-foreground"> — {data.account_name ?? parsed.account}</span>}
                </div>
                {parsed.ref && <div className="text-xs font-mono muted-print text-muted-foreground" dir="ltr">#{parsed.ref}</div>}
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm invoice-table" style={{ borderCollapse: "collapse" }}>
          <thead className="bg-muted">
            <tr>
              <th className="text-center p-2 font-semibold border w-10">#</th>
              <th className="text-right p-2 font-semibold border">الصنف</th>
              <th className="text-center p-2 font-semibold border w-24 hide-on-thermal">الكود</th>
              <th className="text-center p-2 font-semibold border w-16">الكمية</th>
              <th className="text-left p-2 font-semibold border w-28">السعر</th>
              <th className="text-left p-2 font-semibold border w-32">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.sale_items.map((it, i) => (
              <tr key={it.id}>
                <td className="p-2 text-center border font-mono muted-print text-muted-foreground">{i + 1}</td>
                <td className="p-2 border">{it.parts?.name}</td>
                <td className="p-2 border text-center font-mono text-xs hide-on-thermal">{it.parts?.code ?? "—"}</td>
                <td className="p-2 border text-center">{it.qty}</td>
                <td className="p-2 border text-left">{formatSDG(Number(it.unit_price))}</td>
                <td className="p-2 border text-left font-semibold">{formatSDG(Number(it.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-full sm:w-72 text-sm space-y-1">
            <Row label="الإجمالي" value={formatSDG(Number(data.total))} />
            <Row label="الخصم" value={formatSDG(Number(data.discount))} />
            <Row label="الصافي" value={formatSDG(net)} strong />
            {settings.taxEnabled && settings.taxPercent > 0 && (
              <>
                <Row label={`الضريبة (${settings.taxPercent}%)`} value={formatSDG(tax.amount)} />
                <Row label="الإجمالي شامل الضريبة" value={formatSDG(grand)} strong />
              </>
            )}
            <Row label="المدفوع" value={formatSDG(Number(data.paid))} />
            <Row label="المتبقي" value={formatSDG(due)} strong />
          </div>
        </div>

        {parsed.text && (
          <div className="mt-4 pt-3 border-t text-xs hide-on-thermal">
            <span className="muted-print text-muted-foreground">ملاحظات: </span>{parsed.text}
          </div>
        )}

        <div className="mt-6 pt-3 border-t text-center text-[10px] leading-relaxed muted-print text-muted-foreground">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center">
            {settings.storePhone && <span>📞 {settings.storePhone}</span>}
            {settings.storeAddress && <span className="hide-on-thermal">📍 {settings.storeAddress}</span>}
            {settings.storeTaxNo && <span>الرقم الضريبي: {settings.storeTaxNo}</span>}
          </div>
          <div className="mt-1 font-medium">{settings.invoiceFooter || "شكراً لتعاملكم معنا"}</div>
          <div className="mt-0.5 hide-on-thermal opacity-70">نظام 2A — من تطوير أمين أنور أحمد</div>
        </div>

      </div>

      {data.customers && (
        <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)}
          direction="in"
          party={{ id: data.customers.id, name: data.customers.name, balance: Number(data.customers.balance) }}
          saleId={data.id}
          suggested={due} />
      )}

      <EditInvoiceDialog open={editOpen} onClose={() => setEditOpen(false)}
        kind="sale"
        invoice={{
          id: data.id, total: Number(data.total), discount: Number(data.discount),
          paid: Number(data.paid), payment_method: data.payment_method,
          account_name: data.account_name, notes: data.notes,
        }} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "font-bold border-t pt-2" : ""}`}>
      <span className="muted-print text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
