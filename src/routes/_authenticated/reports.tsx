import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { PageHeader, Field, Input, Btn } from "@/components/ui-kit";
import { Logo } from "@/components/Logo";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "التقارير — 2A" }] }),
  component: Reports,
});


function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const { data } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59").toISOString();
      const [{ data: sales }, { data: purchases }, { data: parts }] = await Promise.all([
        supabase.from("sales").select("total,discount,paid").gte("created_at", start).lte("created_at", end),
        supabase.from("purchases").select("total,paid").gte("created_at", start).lte("created_at", end),
        supabase.from("parts").select("quantity,cost_price,sell_price"),
      ]);
      const salesNet = (sales ?? []).reduce((s, r) => s + Number(r.total) - Number(r.discount), 0);
      const salesCollected = (sales ?? []).reduce((s, r) => s + Number(r.paid), 0);
      const purchasesTotal = (purchases ?? []).reduce((s, r) => s + Number(r.total), 0);
      const purchasesPaid = (purchases ?? []).reduce((s, r) => s + Number(r.paid), 0);
      const stockValueCost = (parts ?? []).reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
      const stockValueSell = (parts ?? []).reduce((s, p) => s + Number(p.quantity) * Number(p.sell_price), 0);
      return {
        salesCount: sales?.length ?? 0, salesNet, salesCollected,
        purchasesCount: purchases?.length ?? 0, purchasesTotal, purchasesPaid,
        stockValueCost, stockValueSell,
      };
    },
  });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="no-print">
        <PageHeader
          title="التقارير"
          subtitle="ملخص المبيعات والمشتريات وقيمة المخزون"
          actions={<Btn variant="secondary" onClick={() => window.print()}><Printer className="w-4 h-4 inline ml-1" />طباعة / PDF</Btn>}
        />

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Field label="من"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="إلى"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </div>

      <div className="print-area space-y-6">
        {/* Print header — hidden on screen, shown on print */}
        <div className="hidden print:flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-3">
            <Logo variant="light" className="h-12 w-auto" />
            <div>
              <div className="font-bold text-lg">نظام 2A — التقارير</div>
              <div className="text-xs muted-print text-muted-foreground">قطع غيار السيارات</div>
            </div>
          </div>
          <div className="text-left text-xs muted-print text-muted-foreground">
            <div>الفترة: {from} → {to}</div>
            <div>طُبعت: {new Date().toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}</div>
          </div>
        </div>

        <Section title="المبيعات">
          <Stat label="عدد الفواتير" value={String(data?.salesCount ?? 0)} />
          <Stat label="إجمالي المبيعات (صافي)" value={formatSDG(data?.salesNet ?? 0)} />
          <Stat label="المحصّل" value={formatSDG(data?.salesCollected ?? 0)} />
          <Stat label="المتبقي على العملاء" value={formatSDG((data?.salesNet ?? 0) - (data?.salesCollected ?? 0))} highlight />
        </Section>

        <Section title="المشتريات">
          <Stat label="عدد الفواتير" value={String(data?.purchasesCount ?? 0)} />
          <Stat label="إجمالي المشتريات" value={formatSDG(data?.purchasesTotal ?? 0)} />
          <Stat label="المدفوع" value={formatSDG(data?.purchasesPaid ?? 0)} />
          <Stat label="المستحق للموردين" value={formatSDG((data?.purchasesTotal ?? 0) - (data?.purchasesPaid ?? 0))} highlight />
        </Section>

        <Section title="قيمة المخزون الحالي">
          <Stat label="بسعر التكلفة" value={formatSDG(data?.stockValueCost ?? 0)} />
          <Stat label="بسعر البيع" value={formatSDG(data?.stockValueSell ?? 0)} />
          <Stat label="الربح المتوقع" value={formatSDG((data?.stockValueSell ?? 0) - (data?.stockValueCost ?? 0))} highlight />
        </Section>
      </div>
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-2xl p-4">
      <h2 className="font-bold mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-primary/10" : "bg-muted"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
