import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "الدخول — 2A" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // Ensure profile + role bootstrap
      await supabase.rpc("bootstrap_first_admin");
      toast.success(mode === "signup" ? "تم إنشاء الحساب" : "تم الدخول");
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center"><Logo className="h-28 w-auto" /></div>
          <h1 className="mt-2 text-2xl font-bold">نظام 2A</h1>
          <p className="text-sm text-muted-foreground">إدارة قطع غيار السيارات</p>
        </div>

        <form onSubmit={submit} className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex rounded-lg bg-muted p-1 text-sm">
            <button type="button" onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-md font-medium ${mode === "signin" ? "bg-card shadow" : "text-muted-foreground"}`}>
              دخول
            </button>
            <button type="button" onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-md font-medium ${mode === "signup" ? "bg-card shadow" : "text-muted-foreground"}`}>
              حساب جديد
            </button>
          </div>

          {mode === "signup" && (
            <div>
              <label className="block text-sm mb-1 font-medium">الاسم الكامل</label>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border bg-background" />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1 font-medium">البريد الإلكتروني</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              dir="ltr" className="w-full h-11 px-3 rounded-lg border bg-background text-right" />
          </div>
          <div>
            <label className="block text-sm mb-1 font-medium">كلمة المرور</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background" />
          </div>
          <button disabled={loading} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">
            {loading ? "جارٍ..." : (mode === "signin" ? "دخول" : "إنشاء الحساب")}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          من تطوير <span className="font-semibold text-foreground">أمين أنور أحمد</span>
        </p>
      </div>
    </div>
  );
}
