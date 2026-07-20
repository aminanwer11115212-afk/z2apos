import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "المستخدمون — 2A" }] }),
  component: UsersPage,
});

type Row = { id: string; user_id: string; full_name: string; role: "admin" | "seller" | null };

function UsersPage() {
  const qc = useQueryClient();
  const { data: myRole } = useMyRole();

  const { data = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,user_id,full_name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as "admin" | "seller"]));
      return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.user_id) ?? null })) as Row[];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "seller" }) => {
      const { error: e1 } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("تم تحديث الصلاحية"); qc.invalidateQueries({ queryKey: ["users-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (myRole !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للمديرين فقط</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <PageHeader title="المستخدمون" subtitle={`${data.length} مستخدم`} />
      {data.length === 0 ? <EmptyState title="لا يوجد مستخدمون" /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-medium">الاسم</th>
                <th className="text-right p-3 font-medium">الصلاحية</th>
                <th className="text-right p-3 font-medium">تغيير</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.full_name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${u.role === "admin" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                      {u.role === "admin" ? "مدير" : u.role === "seller" ? "بائع" : "بدون"}
                    </span>
                  </td>
                  <td className="p-3">
                    <select value={u.role ?? ""} disabled={setRole.isPending}
                      onChange={(e) => setRole.mutate({ userId: u.user_id, role: e.target.value as "admin" | "seller" })}
                      className="h-9 px-3 rounded-lg border bg-background">
                      <option value="seller">بائع</option>
                      <option value="admin">مدير</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-4">
        أي شخص يسجّل حساباً جديداً يبدأ كـ«بائع» تلقائياً (أول مستخدم يصبح مديراً). يمكنك ترقيته من هنا.
      </p>
    </div>
  );
}
