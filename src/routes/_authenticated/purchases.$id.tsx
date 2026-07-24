import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { paymentMethodLabel, paymentMethodIcon } from "@/lib/payments";
import { Btn } from "@/components/ui-kit";
import { PaymentDialog } from "@/components/PaymentDialog";
import { EditInvoiceDialog } from "@/components/EditInvoiceDialog";
import { PrintFormatPicker } from "@/components/PrintFormatPicker";
import { Logo } from "@/components/Logo";
import { ArrowRight, Wallet, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchases/$id")({
  head: () => ({ meta: [{ title: "فاتورة شراء — 2A" }] }),
  component: PurchaseView,
});

type PurchaseFull = {
  id: string; invoice_no: number; total: number; paid: number;
  created_at: string; notes: string | null;
  payment_method: string | null; account_name: string | null;
  supplier_id: string | null;
  suppliers: { id: string; name: string; phone: string | null; balance: number } | null;
  purchase_items: { id: string; qty: number; unit_cost: number; subtotal: number;
    parts: { name: string; code: string | null } | null }[];
};

function PurchaseView() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["purchase", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases")
        .select("id,invoice_no,total,paid,created_at,notes,payment_method,account_name,supplier_id, suppliers(id,name,phone,balance), purchase_items(id,qty,unit_cost,subtotal, parts(name,code))")
        .eq("id", id).single();
      if (error) throw error;
      return data as unknown as PurchaseFull;
    },
  });

  useEffect(() => { document.title = data ? `شراء #${data.invoice_no} — 2A` : "فاتورة شراء — 2A"; }, [data]);

  if (isLoading || !data) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  const due = Number(data.total) - Number(data.paid);
  const isThermal = settings.printFormat !== "a4";
  const containerMax = isThermal ? "max-w-sm" : "max-w-3xl";

  return (
    <div className={`p-4 lg:p-6 ${containerMax} mx-auto`}>
      <div className="flex items-center justify-between mb-4 no-print gap-2 flex-wrap">
        <Link to="/purchases" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />العودة للفواتير
        </Link>
        <div className="flex gap-2 items-center flex-wrap">
          {data.suppliers && Number(data.suppliers.balance) < 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
              للمورد رصيد مقدم: {formatSDG(Math.abs(Number(data.suppliers.balance)))}
            </span>
          )}
          <Btn variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 inline ml-1" />تعديل
          </Btn>
          {due > 0 && data.suppliers && (
            <Btn variant="outline" onClick={() => setPayOpen(true)}>
              <Wallet className="w-4 h-4 inline ml-1" />سداد ({formatSDG(due)})
            </Btn>
          )}
          <PrintFormatPicker initial={settings.printFormat} />
        </div>
      </div>

      <div className={`print-area bg-card border rounded-2xl p-6 shadow-sm ${isThermal ? "text-xs" : ""}`}>
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
            <div className="text-xs muted-print text-muted-foreground">فاتورة شراء</div>
            <div className={`font-bold font-mono ${isThermal ? "text-lg" : "text-2xl"}`}>#{data.invoice_no}</div>
            <div className="text-xs muted-print text-muted-foreground mt-1">
              {new Date(data.created_at).toLocaleString("ar-SD", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 py-3 text-sm">
          <div>
            <div className="muted-print text-muted-foreground text-xs">المورد</div>
            <div className="font-semibold">{data.suppliers?.name ?? "—"}</div>
            {data.suppliers?.phone && <div className="text-xs muted-print text-muted-foreground">{data.suppliers.phone}</div>}
          </div>
          {data.account_name && (
            <div>
              <div className="muted-print text-muted-foreground text-xs">الحساب</div>
              <div className="font-semibold">{data.account_name}</div>
            </div>
          )}
          {data.payment_method && (
            <div>
              <div className="muted-print text-muted-foreground text-xs">طريقة الدفع</div>
              <div className="font-semibold">{paymentMethodIcon(data.payment_method)} {paymentMethodLabel(data.payment_method)}</div>
            </div>
          )}
          {data.notes && (
            <div className="col-span-2 hide-on-thermal">
              <div className="muted-print text-muted-foreground text-xs">ملاحظات</div>
              <div>{data.notes}</div>
            </div>
          )}
        </div>

        <table className="w-full text-sm mt-2">
          <thead className="border-y">
            <tr className="text-xs muted-print text-muted-foreground">
              <th className="text-right py-2">الصنف</th>
              <th className="text-center py-2 w-16">كمية</th>
              <th className="text-center py-2 w-24 hide-on-thermal">تكلفة</th>
              <th className="text-left py-2 w-24">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.purchase_items.map((it) => (
              <tr key={it.id}>
                <td className="py-2">
                  <div className="font-medium">{it.parts?.name ?? "—"}</div>
                  {it.parts?.code && <div className="text-xs muted-print text-muted-foreground font-mono">{it.parts.code}</div>}
                </td>
                <td className="py-2 text-center">{Number(it.qty)}</td>
                <td className="py-2 text-center hide-on-thermal">{formatSDG(it.unit_cost)}</td>
                <td className="py-2 text-left font-semibold">{formatSDG(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-full sm:w-72 text-sm space-y-1">
            <Row label="الإجمالي" value={formatSDG(Number(data.total))} strong />
            <Row label="المدفوع" value={formatSDG(Number(data.paid))} />
            <Row label="المستحق" value={formatSDG(due)} strong />
          </div>
        </div>

        <div className="mt-6 pt-3 border-t text-center text-xs muted-print text-muted-foreground">
          {settings.invoiceFooter || "شكراً لتعاملكم معنا"}
          <div className="mt-1 hide-on-thermal">نظام 2A — من تطوير أمين أنور أحمد</div>
        </div>
      </div>

      {data.suppliers && (
        <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)}
          direction="out"
          party={{ id: data.suppliers.id, name: data.suppliers.name, balance: Number(data.suppliers.balance) }}
          purchaseId={data.id}
          suggested={due} />
      )}

      <EditInvoiceDialog open={editOpen} onClose={() => setEditOpen(false)}
        kind="purchase"
        invoice={{
          id: data.id, total: Number(data.total),
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
