import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "الدخول — 2A" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard", replace: true });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await supabase.rpc("bootstrap_first_admin");
      toast.success("تم الدخول");
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <div className="absolute top-3 left-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center">
            <Logo className="h-28 w-auto" />
          </div>
          <h1 className="mt-2 text-2xl font-bold">نظام 2A</h1>
          <p className="text-sm text-muted-foreground">إدارة قطع غيار السيارات</p>
        </div>

        <form onSubmit={submit} className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm mb-1 font-medium">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="w-full h-11 px-3 rounded-lg border bg-background text-right"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 font-medium">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background"
            />
          </div>
          <button
            disabled={loading}
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {loading ? "جارٍ..." : "دخول"}
          </button>
          <p className="text-xs text-center text-muted-foreground">
            الحسابات تُنشأ من قِبل المدير فقط
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          من تطوير <span className="font-semibold text-foreground">أمين أنور أحمد</span>
        </p>
      </div>
    </div>
  );
}
