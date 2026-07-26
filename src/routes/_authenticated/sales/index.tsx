import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { PageHeader, EmptyState, Btn, Field, Input } from "@/components/ui-kit";
import { paymentMethodIcon, paymentMethodLabel } from "@/lib/payments";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales/")({
  head: () => ({ meta: [{ title: "المبيعات — 2A" }] }),
  component: SalesList,
});

type Sale = {
  id: string; invoice_no: number; total: number; discount: number; paid: number;
  created_at: string; notes: string | null; payment_method: string | null;
  customers: { name: string } | null;
};

type PayStatus = "all" | "paid" | "partial" | "credit";

const STATUS_TABS: { v: PayStatus; label: string }[] = [
  { v: "all", label: "الكل" },
  { v: "paid", label: "مدفوعة" },
  { v: "partial", label: "جزئي" },
  { v: "credit", label: "آجل" },
];

function statusOf(s: Sale): Exclude<PayStatus, "all"> {
  const due = Number(s.total) - Number(s.discount) - Number(s.paid);
  if (due <= 0.009) return "paid";
  if (Number(s.paid) > 0) return "partial";
  return "credit";
}

function SalesList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PayStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id,invoice_no,total,discount,paid,created_at,notes,payment_method, customers(name)")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as unknown as Sale[];
    },
  });

  const filtered = useMemo(() => {
    let list = data;
    const s = q.trim();
    if (s) list = list.filter((r) => String(r.invoice_no).includes(s) || (r.customers?.name ?? "نقدي").includes(s));
    if (status !== "all") list = list.filter((r) => statusOf(r) === status);
    if (dateFrom) list = list.filter((r) => r.created_at >= dateFrom + "T00:00:00");
    if (dateTo) list = list.filter((r) => r.created_at <= dateTo + "T23:59:59.999");
    return list;
  }, [data, q, status, dateFrom, dateTo]);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="فواتير المبيعات" subtitle={`${filtered.length} من ${data.length} فاتورة`}
        actions={<Link to="/sales/new"><Btn><Plus className="w-4 h-4 inline ml-1" />فاتورة جديدة</Btn></Link>} />

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl border bg-card flex-1 min-w-52">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم العميل..."
            className="flex-1 bg-transparent outline-none text-sm" />
          {q && <button onClick={() => setQ("")} className="text-xs text-muted-foreground">✕</button>}
        </div>
        <div className="flex gap-1.5">
          {STATUS_TABS.map((t) => (
            <button key={t.v} onClick={() => setStatus(t.v)}
              className={`h-9 px-3 rounded-lg border text-sm ${status === t.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Field label="من"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
        <Field label="إلى"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
      </div>

      {filtered.length === 0 ? (
        data.length === 0
          ? <EmptyState title="لا توجد فواتير" action={<Link to="/sales/new"><Btn>إنشاء أول فاتورة</Btn></Link>} />
          : <div className="p-10 text-center text-muted-foreground border rounded-2xl bg-card">لا توجد نتائج مطابقة للفلاتر</div>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-medium">#</th>
                <th className="text-right p-3 font-medium">التاريخ</th>
                <th className="text-right p-3 font-medium">العميل</th>
                <th className="text-right p-3 font-medium hidden sm:table-cell">الدفع</th>
                <th className="text-right p-3 font-medium">الإجمالي</th>
                <th className="text-right p-3 font-medium">المتبقي</th>
                <th className="text-right p-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const net = Number(s.total) - Number(s.discount);
                const due = net - Number(s.paid);
                const st = statusOf(s);
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) return;
                    nav({ to: "/sales/$id", params: { id: s.id } });
                  }}>
                    <td className="p-3 font-mono">
                      <Link to="/sales/$id" params={{ id: s.id }} className="text-primary hover:underline">#{s.invoice_no}</Link>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="p-3">{s.customers?.name ?? <span className="text-muted-foreground">نقدي</span>}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">
                      {s.payment_method ? <>{paymentMethodIcon(s.payment_method)} {paymentMethodLabel(s.payment_method)}</> : "—"}
                    </td>
                    <td className="p-3 font-semibold">{formatSDG(net)}</td>
                    <td className={`p-3 font-semibold ${due > 0 ? "text-destructive" : "text-success"}`}>{formatSDG(Math.max(0, due))}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        st === "paid" ? "bg-success/10 text-success"
                        : st === "partial" ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"}`}>
                        {st === "paid" ? "مدفوعة" : st === "partial" ? "جزئي" : "آجل"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
