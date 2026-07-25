import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Package, ShoppingCart, AlertTriangle, Users, TrendingUp, Wallet } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({ head: () => ({ meta: [{ title: "الرئيسية — 2A" }] }), component: Dashboard });

const AR_DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6); const iso = (d: Date) => d.toISOString();
      const [{ data: weekSales }, { data: parts }, { count: partsCount }, { count: custCount }, { data: lowStockList }] = await Promise.all([
        supabase.from("sales").select("total,discount,paid,created_at").gte("created_at", iso(weekStart)),
        supabase.from("parts").select("id,quantity,min_quantity"),
        supabase.from("parts").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("parts").select("id,code,name,quantity,min_quantity").order("quantity").limit(50),
      ]);
      const todayIso = today.toISOString().slice(0, 10);
      const todaySalesArr = (weekSales ?? []).filter((r) => r.created_at.slice(0, 10) === todayIso);
      const todaySales = todaySalesArr.reduce((s, r) => s + Number(r.total) - Number(r.discount), 0);
      const lowStock = (parts ?? []).filter((p) => Number(p.quantity) <= Number(p.min_quantity)).length;
      const days: { day: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); const key = d.toISOString().slice(0, 10); const total = (weekSales ?? []).filter((r) => r.created_at.slice(0, 10) === key).reduce((s, r) => s + Number(r.total) - Number(r.discount), 0); days.push({ day: AR_DAYS[d.getDay()], total: Math.round(total) }); }
      const lowStockItems = (lowStockList ?? []).filter((p) => Number(p.quantity) <= Number(p.min_quantity)).slice(0, 6);
      return { todaySales, salesCount: todaySalesArr.length, partsCount: partsCount ?? 0, custCount: custCount ?? 0, lowStock, days, lowStockItems };
    },
  });

  const cards = [
    { label: "مبيعات اليوم", value: formatSDG(stats.data?.todaySales ?? 0), Icon: ShoppingCart, color: "bg-primary/10 text-primary" },
    { label: "فواتير اليوم", value: String(stats.data?.salesCount ?? 0), Icon: TrendingUp, color: "bg-success/10 text-success" },
    { label: "أصناف المخزون", value: String(stats.data?.partsCount ?? 0), Icon: Package, color: "bg-accent text-accent-foreground" },
    { label: "أصناف منخفضة", value: String(stats.data?.lowStock ?? 0), Icon: AlertTriangle, color: "bg-warning/20 text-warning-foreground" },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold">الرئيسية</h1><p className="text-sm text-muted-foreground">نظرة عامة سريعة على أعمال اليوم.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border rounded-2xl p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}><c.Icon className="w-5 h-5" /></div>
            <div className="mt-3 text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border rounded-2xl p-4">
          <h2 className="font-bold mb-3">مبيعات آخر ٧ أيام</h2>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.data?.days ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v: number) => [formatSDG(v), "المبيعات"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-bold">أصناف منخفضة</h2><Link to="/parts" className="text-xs text-primary hover:underline">عرض الكل</Link></div>
          {!stats.data?.lowStockItems?.length ? <p className="text-sm text-muted-foreground py-4 text-center">لا توجد أصناف منخفضة 🎉</p> : (
            <ul className="space-y-2">
              {stats.data.lowStockItems.map((p) => <li key={p.id} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0"><div className="min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-xs text-muted-foreground font-mono">{p.code}</div></div><span className="text-destructive font-semibold text-sm shrink-0 pr-2">{Number(p.quantity)}</span></li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <QuickLink to="/sales/new" label="فاتورة بيع جديدة" Icon={ShoppingCart} primary />
        <QuickLink to="/parts" label="إدارة المخزون" Icon={Package} />
        <QuickLink to="/customers" label="العملاء" Icon={Users} />
        <QuickLink to="/accounts" label="الحسابات" Icon={Wallet} />
        <QuickLink to="/reports" label="التقارير" Icon={TrendingUp} />
      </div>

      <p className="text-center text-xs text-muted-foreground pt-4">من تطوير <span className="font-semibold text-foreground">أمين أنور أحمد</span></p>
    </div>
  );
}

function QuickLink({ to, label, Icon, primary }: { to: string; label: string; Icon: typeof Package; primary?: boolean }) {
  return <Link to={to} className={`rounded-2xl p-4 border flex items-center gap-3 font-semibold ${primary ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}><Icon className="w-5 h-5" />{label}</Link>;
}
