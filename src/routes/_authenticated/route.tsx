import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole, useSession, useSignOut } from "@/lib/auth";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building2, BarChart3,
  UserCog, LogOut, Menu, Database, Settings as SettingsIcon, ChevronDown, Zap
} from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    try { await supabase.rpc("bootstrap_first_admin"); } catch { /* ignore */ }
    return { userId: data.user.id };
  },
  component: AuthedLayout,
});

type NavItem = { to: string; label: string; Icon: typeof Package; adminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean };

const HOME: NavItem = { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard };

const GROUPS: NavGroup[] = [
  {
    label: "المنتجات",
    items: [
      { to: "/sales/new", label: "بيع سريع", Icon: Zap },
      { to: "/parts", label: "قطع الغيار", Icon: Package },
    ],
  },
  {
    label: "المعاملات",
    items: [
      { to: "/sales", label: "المبيعات", Icon: ShoppingCart },
      { to: "/purchases", label: "المشتريات", Icon: Truck, adminOnly: true },
    ],
  },
  {
    label: "جهات الاتصال",
    items: [
      { to: "/customers", label: "العملاء", Icon: Users },
      { to: "/suppliers", label: "الموردون", Icon: Building2, adminOnly: true },
    ],
  },
  {
    label: "التحليل",
    items: [
      { to: "/reports", label: "التقارير", Icon: BarChart3 },
    ],
  },
  {
    label: "النظام",
    adminOnly: true,
    items: [
      { to: "/settings", label: "الإعدادات", Icon: SettingsIcon, adminOnly: true },
      { to: "/users", label: "المستخدمون", Icon: UserCog, adminOnly: true },
      { to: "/data", label: "البيانات", Icon: Database, adminOnly: true },
    ],
  },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
  { to: "/parts", label: "المخزون", Icon: Package },
  { to: "/sales/new", label: "بيع", Icon: Zap },
  { to: "/sales", label: "الفواتير", Icon: BarChart3 },
];

function AuthedLayout() {
  const { data: session } = useSession();
  const { data: role } = useMyRole();
  const signOut = useSignOut();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "admin";

  const visibleGroups = GROUPS
    .filter((g) => !g.adminOnly || isAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 h-14 bg-card border-b flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -mr-2" aria-label="القائمة">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-auto" />
          <div className="font-bold hidden sm:inline">نظام 2A</div>
        </div>
        <div className="mr-auto flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-muted-foreground">{session?.user.email}</span>
          {role && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground">
              {isAdmin ? "مدير" : "بائع"}
            </span>
          )}
          <ThemeToggle />
          <button onClick={signOut} className="p-2 hover:bg-muted rounded-lg" aria-label="خروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden lg:block w-60 shrink-0 border-l min-h-[calc(100vh-3.5rem)] bg-card">
          <nav className="p-3 space-y-1">
            <NavLink item={HOME} path={path} />
            {visibleGroups.map((g) => (
              <SidebarGroup key={g.label} group={g} path={path} />
            ))}
          </nav>
        </aside>

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative w-72 bg-card border-l h-full overflow-y-auto animate-in slide-in-from-right">
              <div className="h-14 border-b flex items-center px-4 font-bold">القائمة</div>
              <nav className="p-3 space-y-1">
                <NavLink item={HOME} path={path} onClick={() => setMobileOpen(false)} />
                {visibleGroups.map((g) => (
                  <SidebarGroup key={g.label} group={g} path={path} onNavigate={() => setMobileOpen(false)} defaultOpen />
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>

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

function NavLink({ item, path, onClick }: { item: NavItem; path: string; onClick?: () => void }) {
  const active = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
  return (
    <Link to={item.to} onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
      <item.Icon className="w-4 h-4" />
      {item.label}
    </Link>
  );
}

function SidebarGroup({ group, path, onNavigate, defaultOpen }: { group: NavGroup; path: string; onNavigate?: () => void; defaultOpen?: boolean }) {
  const anyActive = group.items.some((i) => path === i.to || (i.to !== "/dashboard" && path.startsWith(i.to)));
  const [open, setOpen] = useState(defaultOpen ?? anyActive);
  return (
    <div className="pt-2">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <span>{group.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {group.items.map((n) => (
            <NavLink key={n.to} item={n} path={path} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
