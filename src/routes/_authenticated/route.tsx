import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole, useSession, useSignOut } from "@/lib/auth";
import { LayoutDashboard, Package, ShoppingCart, Truck, Users, Building2, BarChart3, UserCog, LogOut, Menu } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    // ensure bootstrap ran once
    await supabase.rpc("bootstrap_first_admin").catch(() => {});
    return { userId: data.user.id };
  },
  component: AuthedLayout,
});

type NavItem = { to: string; label: string; Icon: typeof Package; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
  { to: "/sales/new", label: "بيع سريع", Icon: ShoppingCart },
  { to: "/parts", label: "قطع الغيار", Icon: Package },
  { to: "/sales", label: "المبيعات", Icon: ShoppingCart },
  { to: "/purchases", label: "المشتريات", Icon: Truck, adminOnly: true },
  { to: "/customers", label: "العملاء", Icon: Users },
  { to: "/suppliers", label: "الموردون", Icon: Building2, adminOnly: true },
  { to: "/reports", label: "التقارير", Icon: BarChart3 },
  { to: "/users", label: "المستخدمون", Icon: UserCog, adminOnly: true },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
  { to: "/parts", label: "المخزون", Icon: Package },
  { to: "/sales/new", label: "بيع", Icon: ShoppingCart },
  { to: "/sales", label: "الفواتير", Icon: BarChart3 },
];

function AuthedLayout() {
  const { data: session } = useSession();
  const { data: role } = useMyRole();
  const signOut = useSignOut();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "admin";
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 h-14 bg-card border-b flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -mr-2" aria-label="القائمة">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">2A</div>
          <div className="font-bold">نظام 2A</div>
        </div>
        <div className="mr-auto flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-muted-foreground">{session?.user.email}</span>
          {role && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground">
              {isAdmin ? "مدير" : "بائع"}
            </span>
          )}
          <button onClick={signOut} className="p-2 hover:bg-muted rounded-lg" aria-label="خروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 border-l min-h-[calc(100vh-3.5rem)] bg-card">
          <nav className="p-3 space-y-1">
            {items.map((n) => {
              const active = path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to));
              return (
                <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <n.Icon className="w-4 h-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative w-64 bg-card border-l h-full overflow-y-auto animate-in slide-in-from-right">
              <div className="h-14 border-b flex items-center px-4 font-bold">القائمة</div>
              <nav className="p-3 space-y-1">
                {items.map((n) => {
                  const active = path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to));
                  return (
                    <Link key={n.to} to={n.to} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                      <n.Icon className="w-4 h-4" />
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t h-16 flex">
        {MOBILE_NAV.map((n) => {
          const active = path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to));
          return (
            <Link key={n.to} to={n.to} className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
              <n.Icon className="w-5 h-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
