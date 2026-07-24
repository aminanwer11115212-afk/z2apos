import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings, parseNotes } from "@/lib/settings";
import { paymentMethodLabel, paymentMethodIcon } from "@/lib/payments";
import { Btn } from "@/components/ui-kit";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Logo } from "@/components/Logo";
import { Printer, ArrowRight, Wallet } from "lucide-react";


export const Route = createFileRoute("/_authenticated/sales/$id")({
  head: () => ({ meta: [{ title: "فاتورة — 2A" }] }),
  component: SaleView,
  errorComponent: ({ reset }) => {
    const r = useRouter();
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">تعذّر تحميل الفاتورة</p>
        <button className="mt-4 underline" onClick={() => { r.invalidate(); reset(); }}>إعادة المحاولة</button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-center">الفاتورة غير موجودة</div>,
});

type SaleFull = {
  id: string; invoice_no: number; total: number; discount: number; paid: number;
  created_at: string; notes: string | null;
  payment_method: string | null; account_name: string | null;
  customer_id: string | null;
  customers: { id: string; name: string; phone: string | null; balance: number } | null;
  sale_items: { id: string; qty: number; unit_price: number; subtotal: number;
    parts: { name: string; sku: string | null } | null }[];
};

function SaleView() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const { data, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id,invoice_no,total,discount,paid,created_at,notes, customers(name,phone), sale_items(id,qty,unit_price,subtotal, parts(name,sku))")
        .eq("id", id).single();
      if (error) throw error;
      return data as unknown as SaleFull;
    },
  });

  // Apply print format class to <body> so @page rules take effect
  useEffect(() => {
    const cls = `print-format-${settings.printFormat}`;
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [settings.printFormat]);

  if (isLoading || !data) return <div className="p-6 text-center text-muted-foreground">جارٍ التحميل…</div>;

  const net = Number(data.total) - Number(data.discount);
  const due = net - Number(data.paid);
  const parsed = parseNotes(data.notes);
  const isThermal = settings.printFormat !== "a4";
  const containerMax = isThermal ? "max-w-sm" : "max-w-3xl";

  return (
    <div className={`p-4 lg:p-6 ${containerMax} mx-auto`}>
      <div className="flex items-center justify-between mb-4 no-print">
        <Link to="/sales" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />العودة للفواتير
        </Link>
        <Btn onClick={() => window.print()}><Printer className="w-4 h-4 inline ml-1" />طباعة / PDF</Btn>
      </div>

      <div className={`print-area bg-card border rounded-2xl p-6 shadow-sm ${isThermal ? "text-xs" : ""}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b">
          <div className="flex items-center gap-3">
            {settings.showLogo && <Logo variant="light" className={isThermal ? "h-10 w-auto" : "h-14 w-auto"} />}
            <div>
              <div className={`font-bold ${isThermal ? "text-sm" : "text-lg"}`}>{settings.storeName || "نظام 2A"}</div>
              {settings.storePhone && <div className="text-xs muted-print text-muted-foreground">📞 {settings.storePhone}</div>}
              {settings.storeAddress && <div className="text-xs muted-print text-muted-foreground hide-on-thermal">{settings.storeAddress}</div>}
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs muted-print text-muted-foreground">رقم الفاتورة</div>
            <div className={`font-bold font-mono ${isThermal ? "text-lg" : "text-2xl"}`}>#{data.invoice_no}</div>
            <div className="text-xs muted-print text-muted-foreground mt-1">
              {new Date(data.created_at).toLocaleString("ar-SD", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
        </div>

        {/* Customer + account */}
        <div className="grid grid-cols-2 gap-3 py-3 text-sm">
          <div>
            <div className="muted-print text-muted-foreground text-xs">العميل</div>
            <div className="font-semibold">{data.customers?.name ?? "نقدي"}</div>
            {data.customers?.phone && <div className="text-xs muted-print text-muted-foreground">{data.customers.phone}</div>}
          </div>
          {parsed.account && (
            <div>
              <div className="muted-print text-muted-foreground text-xs">الحساب</div>
              <div className="font-semibold">{parsed.account}</div>
            </div>
          )}
          {parsed.text && (
            <div className="col-span-2 hide-on-thermal">
              <div className="muted-print text-muted-foreground text-xs">ملاحظات</div>
              <div>{parsed.text}</div>
            </div>
          )}
        </div>


        {/* Items */}
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-2 font-medium">الصنف</th>
              <th className="text-center p-2 font-medium w-16">الكمية</th>
              <th className="text-left p-2 font-medium w-28">السعر</th>
              <th className="text-left p-2 font-medium w-32">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.sale_items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">
                  {it.parts?.name}
                  {it.parts?.sku && <span className="text-xs muted-print text-muted-foreground mr-1">({it.parts.sku})</span>}
                </td>
                <td className="p-2 text-center">{it.qty}</td>
                <td className="p-2 text-left">{formatSDG(Number(it.unit_price))}</td>
                <td className="p-2 text-left font-semibold">{formatSDG(Number(it.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-full sm:w-72 text-sm space-y-1">
            <Row label="الإجمالي" value={formatSDG(Number(data.total))} />
            <Row label="الخصم" value={formatSDG(Number(data.discount))} />
            <Row label="الصافي" value={formatSDG(net)} strong />
            <Row label="المدفوع" value={formatSDG(Number(data.paid))} />
            <Row label="المتبقي" value={formatSDG(due)} strong />
          </div>
        </div>

        <div className="mt-6 pt-3 border-t text-center text-xs muted-print text-muted-foreground">
          {settings.invoiceFooter || "شكراً لتعاملكم معنا"}
          <div className="mt-1 hide-on-thermal">نظام 2A — من تطوير أمين أنور أحمد</div>
        </div>

      </div>
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
