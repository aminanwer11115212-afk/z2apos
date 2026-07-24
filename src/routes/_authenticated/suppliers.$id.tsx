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

export const Route = createFileRoute("/_authenticated/suppliers/$id")({
  head: () => ({ meta: [{ title: "كشف حساب مورد — 2A" }] }),
  component: SupplierStatement,
});

type Supplier = { id: string; name: string; phone: string | null; address: string | null; balance: number };
type Row =
  | { kind: "purchase"; id: string; date: string; ref: string; debit: number; credit: number; note: string }
  | { kind: "payment"; id: string; date: string; ref: string; debit: number; credit: number; note: string };

function SupplierStatement() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);

  const { data: sup } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).single();
      if (error) throw error; return data as Supplier;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["supplier-statement", id],
    queryFn: async () => {
      const [pRes, payRes] = await Promise.all([
        supabase.from("purchases").select("id,invoice_no,total,paid,created_at,notes").eq("supplier_id", id).order("created_at"),
        supabase.from("payments").select("id,amount,method,account_name,notes,created_at,purchase_id").eq("supplier_id", id).eq("direction", "out").order("created_at"),
      ]);
      const list: Row[] = [];
      // For suppliers: purchases increase what we owe (credit), payments decrease it (debit)
      for (const p of pRes.data ?? []) {
        list.push({ kind: "purchase", id: p.id, date: p.created_at, ref: `شراء #${p.invoice_no}`, debit: Number(p.paid), credit: Number(p.total), note: p.notes ?? "" });
      }
      for (const pay of payRes.data ?? []) {
        list.push({ kind: "payment", id: pay.id, date: pay.created_at, ref: `سداد${pay.purchase_id ? " (على فاتورة)" : ""}`, debit: Number(pay.amount), credit: 0, note: `${paymentMethodLabel(pay.method)}${pay.account_name ? " · " + pay.account_name : ""}${pay.notes ? " · " + pay.notes : ""}` });
      }
      list.sort((a, b) => a.date.localeCompare(b.date));
      return list;
    },
  });

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const r of rows) { debit += r.debit; credit += r.credit; }
    return { debit, credit, balance: credit - debit };
  }, [rows]);

  let running = 0;

  if (!sup) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="no-print">
        <PageHeader title={sup.name} subtitle={sup.phone ?? undefined}
          actions={<div className="flex gap-2 flex-wrap">
            {Number(sup.balance) > 0 && (
              <Btn variant="outline" onClick={() => setPayOpen(true)}>
                <Wallet className="w-4 h-4 inline ml-1" />سداد ({formatSDG(sup.balance)})
              </Btn>
            )}
            {sup.phone && (() => {
              const msg = renderTemplate(settings.waReminderTemplate, {
                name: sup.name, balance: formatSDG(sup.balance), store: settings.storeName,
              });
              const href = `https://wa.me/${sup.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(msg)}`;
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  <Btn variant="outline"><MessageCircle className="w-4 h-4 inline ml-1" />واتساب</Btn>
                </a>
              );
            })()}
            <Btn onClick={() => window.print()}><Printer className="w-4 h-4 inline ml-1" />طباعة</Btn>
          </div>} />
        <Link to="/suppliers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
          <ArrowRight className="w-4 h-4" />العودة للموردين
        </Link>
      </div>

      <div className="print-area bg-card border rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 pb-3 border-b">
          <div className="flex items-center gap-3">
            {settings.showLogo && <Logo variant="light" className="h-12 w-auto" />}
            <div>
              <div className="font-bold text-lg">{settings.storeName || "نظام 2A"}</div>
              <div className="text-xs muted-print text-muted-foreground">كشف حساب مورد</div>
            </div>
          </div>
          <div className="text-left text-xs muted-print text-muted-foreground">
            <div>المورد: <span className="font-bold text-foreground">{sup.name}</span></div>
            {sup.phone && <div>هاتف: {sup.phone}</div>}
            <div>طُبع: {new Date().toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}</div>
          </div>
        </div>

        <table className="w-full text-sm mt-3">
          <thead className="text-xs muted-print text-muted-foreground border-b">
            <tr>
              <th className="text-right py-2">التاريخ</th>
              <th className="text-right py-2">البيان</th>
              <th className="text-center py-2 w-24">مدين (سداد)</th>
              <th className="text-center py-2 w-24">دائن (شراء)</th>
              <th className="text-left py-2 w-28">الرصيد المستحق</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">لا توجد حركات</td></tr>
            ) : rows.map((r) => {
              running += r.credit - r.debit;
              return (
                <tr key={`${r.kind}-${r.id}`}>
                  <td className="py-2 text-xs muted-print text-muted-foreground">{new Date(r.date).toLocaleDateString("ar-SD")}</td>
                  <td className="py-2">
                    <div className="font-medium">{r.ref}</div>
                    {r.note && <div className="text-xs muted-print text-muted-foreground">{r.note}</div>}
                  </td>
                  <td className="py-2 text-center">{r.debit ? formatSDG(r.debit) : "—"}</td>
                  <td className="py-2 text-center">{r.credit ? formatSDG(r.credit) : "—"}</td>
                  <td className={`py-2 text-left font-semibold ${running > 0 ? "text-destructive" : "text-success"}`}>{formatSDG(running)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t font-bold">
            <tr>
              <td colSpan={2} className="py-2">الإجمالي</td>
              <td className="py-2 text-center">{formatSDG(totals.debit)}</td>
              <td className="py-2 text-center">{formatSDG(totals.credit)}</td>
              <td className={`py-2 text-left ${totals.balance > 0 ? "text-destructive" : "text-success"}`}>{formatSDG(totals.balance)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 pt-3 border-t text-center text-xs muted-print text-muted-foreground">
          {settings.invoiceFooter || "شكراً لتعاملكم معنا"}
        </div>
      </div>

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)}
        direction="out"
        party={{ id: sup.id, name: sup.name, balance: Number(sup.balance) }}
        suggested={Number(sup.balance)} />
    </div>
  );
}
