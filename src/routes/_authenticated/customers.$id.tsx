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
    ? `https://wa.me/${cust.phone