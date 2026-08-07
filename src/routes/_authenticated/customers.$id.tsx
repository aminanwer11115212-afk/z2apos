import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings, renderTemplate } from "@/lib/settings";
import { paymentMethodLabel } from "@/lib/payments";
import { whatsappUrl } from "@/lib/utils";
import { Btn, PageHeader } from "@/components/ui-kit";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Logo } from "@/components/Logo";
import { Printer, ArrowRight, Wallet, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({ meta: [{ title: "كشف حساب عميل — 2A" }] }),
  component: CustomerStatement,
});

type Customer = { id: string; name: string; phone: string | null; address: string | null; balance: number };
type Row =
  | { kind: "sale"; id: string; date: string; ref: string; debit: number; credit: number; note: string }
  | { kind: "payment"; id: string; date: string; ref: string; debit: number; credit: number; note: string };

function CustomerStatement() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);

  const { data: cust } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error; return data as Customer;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["customer-statement", id],
    queryFn: async () => {
      const [salesRes, paymentsRes] = await Promise.all([
        supabase.from("sales").select("id,invoice_no,total,discount,paid,created_at,notes").eq("customer_id", id).order("created_at"),
        supabase.from("payments").select("id,amount,method,account_name,notes,created_at,sale_id").eq("customer_id", id).eq("direction", "in").order("created_at"),
      ]);
      // A payment linked to a sale is already folded into sales.paid by the
      // apply_payment trigger. Crediting both the invoice row and the payment row
      // would count it twice, so the invoice only credits what was paid up front.
      const linkedToSale = new Map<string, number>();
      for (const p of paymentsRes.data ?? []) {
        if (p.sale_id) linkedToSale.set(p.sale_id, (linkedToSale.get(p.sale_id) ?? 0) + Number(p.amount));
      }

      const list: Row[] = [];
      for (const s of salesRes.data ?? []) {
        const net = Number(s.total) - Number(s.discount);
        const paidAtSale = Number(s.paid) - (linkedToSale.get(s.id) ?? 0);
        list.push({ kind: "sale", id: s.id, date: s.created_at, ref: `فاتورة #${s.invoice_no}`, debit: net, credit: Math.max(0, paidAtSale), note: s.notes ?? "" });
      }
      for (const p of paymentsRes.data ?? []) {
        list.push({ kind: "payment", id: p.id, date: p.created_at, ref: `دفعة${p.sale_id ? " (على فاتورة)" : ""}`, debit: 0, credit: Number(p.amount), note: `${paymentMethodLabel(p.method)}${p.account_name ? " · " + p.account_name : ""}${p.notes ? " · " + p.notes : ""}` });
      }
      list.sort((a, b) => a.date.localeCompare(b.date));
      return list;
    },
  });

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const r of rows) { debit += r.debit; credit += r.credit; }
    return { debit, credit, balance: debit - credit };
  }, [rows]);

  let running = 0;

  if (!cust) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  const waHref = cust.phone
    ? whatsappUrl(
        cust.phone,
        renderTemplate(settings.waReminderTemplate, {
          name: cust.name, balance: formatSDG(cust.balance), store: settings.storeName,
        })
      )
    : undefined;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="no-print">
        <PageHeader title={cust.name} subtitle={cust.phone ?? undefined}
          actions={<div className="flex gap-2 flex-wrap items-center">
            {Number(cust.balance) < 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
                رصيد فائض: {formatSDG(Math.abs(Number(cust.balance)))}
              </span>
            )}
            <Btn variant="outline" onClick={() => setPayOpen(true)}>
              <Wallet className="w-4 h-4 inline ml-1" />
              {Number(cust.balance) > 0 ? `تحصيل (${formatSDG(Number(cust.balance))})` : "تسجيل دفعة"}
            </Btn>
            {waHref && (
              <a href={waHref} target="_blank" rel="noreferrer">
                <Btn variant="outline"><MessageCircle className="w-4 h-4 inline ml-1" />واتساب</Btn>
              </a>
            )}
            <Btn variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" /></Btn>
          </div>} />
        <Link to="/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowRight className="w-4 h-4 ml-1" />العودة إلى قائمة العملاء</Link>
      </div>

      <div className="print-area bg-card border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">كشف حساب العميل</h2>
            <p className="text-sm text-muted-foreground">{cust.name} · {cust.phone || "—"} · {cust.address || "—"}</p>
          </div>
          <Logo className="w-16 h-16" />
        </div>

        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right p-2">التاريخ</th>
              <th className="text-right p-2">العملية</th>
              <th className="text-right p-2">مدين</th>
              <th className="text-right p-2">دائن</th>
              <th className="text-right p-2">رصيد</th>
              <th className="text-right p-2">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              running += r.debit - r.credit;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.date).toLocaleDateString("ar-SD")}</td>
                  <td className="p-2 font-medium">
                    {r.kind === "sale" ? <Link to="/sales/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.ref}</Link> : r.ref}
                  </td>
                  <td className="p-2">{r.debit ? formatSDG(r.debit) : "—"}</td>
                  <td className="p-2">{r.credit ? formatSDG(r.credit) : "—"}</td>
                  <td className={`p-2 font-semibold ${running > 0 ? "text-destructive" : ""}`}>{formatSDG(running)}</td>
                  <td className="p-2 text-muted-foreground">{r.note}</td>
                </tr>
              );
            })}
            <tr className="border-t bg-muted font-semibold">
              <td className="p-2" colSpan={2}>المجموع</td>
              <td className="p-2">{formatSDG(totals.debit)}</td>
              <td className="p-2">{formatSDG(totals.credit)}</td>
              <td className={`p-2 ${totals.balance > 0 ? "text-destructive" : ""}`}>{formatSDG(totals.balance)}</td>
              <td className="p-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {payOpen && (
        <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)}
          direction="in"
          party={{ id: cust.id, name: cust.name, balance: Number(cust.balance) }}
          suggested={Number(cust.balance)} />
      )}
    </div>
  );
}
