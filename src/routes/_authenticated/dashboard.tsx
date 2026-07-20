import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Package, ShoppingCart, AlertTriangle, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "الرئيسية — 2A" }] }),
  component: Dashboard,
});

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: sales }, { data: parts }, { count: partsCount }, { count: custCount }] = await Promise.all([
        supabase.from("sales").select("total,discount,paid").gte("created_at", today),
        supabase.from("parts").select("id,quantity,min_quantity"),
        supabase.from("parts").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
      ]);
      const todaySales = (sales ?? []).reduce((s, r) => s + Number(r.total) - Number(r.discount), 0);
      const lowStock = (parts ?? []).filter((p) => Number(p.quantity) <= Number(p.min_quantity)).length;
      return { todaySales, salesCount: sales?.length ?? 0, partsCount: partsCount ?? 0, custCount: custCount ?? 0, lowStock };
    },
  });

  const cards = [
    { label: "مبيعات اليوم", value: formatSDG(stats.data?.todaySales ?? 0), Icon: ShoppingCart, color: "bg-primary/10 text-primary" },
    { label: "فواتير اليوم", value: String(stats.data?.salesCount ?? 0), Icon: ShoppingCart, color: "bg-success/10 text-success" },
    { label: "أصناف المخزون", value: String(stats.data?.partsCount ?? 0), Icon: Package, color: "bg-accent text-accent-foreground" },
    { label: "أصناف منخفضة", value: String(stats.data?.lowStock ?? 0), Icon: AlertTriangle, color: "bg-warning/20 text-warning-foreground" },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الرئيسية</h1>
        <p className="text-sm text-muted-foreground">نظرة عامة سريعة على أعمال اليوم.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border rounded-2xl p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
              <c.Icon className="w-5 h-5" />
            </div>
            <div className="mt-3 text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink to="/sales/new" label="فاتورة بيع جديدة" Icon={ShoppingCart} primary />
        <QuickLink to="/parts" label="إدارة المخزون" Icon={Package} />
        <QuickLink to="/customers" label="العملاء" Icon={Users} />
        <QuickLink to="/reports" label="التقارير" Icon={AlertTriangle} />
      </div>

      <p className="text-center text-xs text-muted-foreground pt-4">
        من تطوير <span className="font-semibold text-foreground">أمين أنور أحمد</span>
      </p>
    </div>
  );
}

function QuickLink({ to, label, Icon, primary }: { to: string; label: string; Icon: typeof Package; primary?: boolean }) {
  return (
    <Link to={to} className={`rounded-2xl p-4 border flex items-center gap-3 font-semibold ${primary ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
      <Icon className="w-5 h-5" />
      {label}
    </Link>
  );
}
