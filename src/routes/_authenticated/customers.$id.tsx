import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings, renderTemplate } from "@/lib/settings";
import { paymentMethodLabel } from "@/lib/payments";
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
      const list: Row[] = [];
      for (const s of salesRes.data ?? []) {
        const net = Number(s.total) - Number(s.discount);
        list.push({ kind: "sale", id: s.id, date: s.created_at, ref: `فاتورة #${s.invoice_no}`, debit: net, credit: Number(s.paid), note: s.notes ?? "" });
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
    ? `https://wa.me/${cust.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
        renderTemplate(settings.waReminderTemplate, {
          name: cust.name, balance: formatSDG(cust.balance), store: settings.storeName,
        })
      )}`
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
              {Number(cust.balance) > 0 ? `تحصيل (${formatSDG(cust.balance)})` : "إيداع مقدم"}
            </Btn>
            {waHref && (
              <a href={waHref} target="_blank" rel="noreferrer">
                <Btn variant="outline"><MessageCircle className="w-4 h-4 inline ml-1" />تذكير واتساب</Btn>
              </a>
            )}
            <Btn onClick={() => window.print()}><Printer className="w-4 h-4 inline ml-1" />طباعة</Btn>
          </div>} />
        <Link to="/customers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
          <ArrowRight className="w-4 h-4" />العودة للعملاء
        </Link>
      </div>

      <div className="print-area bg-card border rounded-2