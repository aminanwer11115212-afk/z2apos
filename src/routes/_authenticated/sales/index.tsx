import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { PageHeader, EmptyState, Btn } from "@/components/ui-kit";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales/")({
  head: () => ({ meta: [{ title: "المبيعات — 2A" }] }),
  component: SalesList,
});

type Sale = {
  id: string; invoice_no: number; total: number; discount: number; paid: number;
  created_at: string; notes: string | null;
  customers: { name: string } | null;
};

function SalesList() {
  const { data = [] } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id,invoice_no,total,discount,paid,created_at,notes, customers(name)")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as unknown as Sale[];
    },
  });

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="فواتير المبيعات" subtitle={`آخر ${data.length} فاتورة`}
        actions={<Link to="/sales/new"><Btn><Plus className="w-4 h-4 inline ml-1" />فاتورة جديدة</Btn></Link>} />

      {data.length === 0 ? <EmptyState title="لا توجد فواتير" action={<Link to="/sales/new"><Btn>إنشاء أول فاتورة</Btn></Link>} /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-medium">#</th>
                <th className="text-right p-3 font-medium">التاريخ</th>
                <th className="text-right p-3 font-medium">العميل</th>
                <th className="text-right p-3 font-medium">الإجمالي</th>
                <th className="text-right p-3 font-medium">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const net = Number(s.total) - Number(s.discount);
                const due = net - Number(s.paid);
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/50">
                    <td className="p-3 font-mono">{s.invoice_no}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="p-3">{s.customers?.name ?? <span className="text-muted-foreground">نقدي</span>}</td>
                    <td className="p-3 font-semibold">{formatSDG(net)}</td>
                    <td className={`p-3 font-semibold ${due > 0 ? "text-destructive" : "text-success"}`}>{formatSDG(due)}</td>
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
