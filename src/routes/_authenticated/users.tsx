import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMyRole } from "@/lib/auth";
import { PageHeader, EmptyState, Modal, Field, Input, Btn, useDialog } from "@/components/ui-kit";
import { toast } from "sonner";
import { adminListUsers, adminCreateUser, adminResetPassword, adminSetRole, adminDeleteUser } from "@/lib/admin.functions";
import { Plus, Key, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "المستخدمون — 2A" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { data: myRole } = useMyRole();
  const list = useServerFn(adminListUsers);
  const create = useServerFn(adminCreateUser);
  const reset = useServerFn(adminResetPassword);
  const setRoleFn = useServerFn(adminSetRole);
  const delFn = useServerFn(adminDeleteUser);

  const newDlg = useDialog();
  const pwDlg = useDialog();
  const [pwTarget, setPwTarget] = useState<{ userId: string; email: string } | null>(null);
  const [newPw, setNewPw] = useState("");
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "seller" as "admin" | "seller" });

  const { data = [], isLoading } = useQuery({
    queryKey: ["users-list-admin"],
    queryFn: () => list(),
    enabled: myRole === "admin",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users-list-admin"] });

  const mCreate = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { toast.success("تم إنشاء الحساب"); invalidate(); newDlg.hide(); setForm({ email: "", password: "", fullName: "", role: "seller" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mSetRole = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "seller" }) => setRoleFn({ data: v }),
    onSuccess: () => { toast.success("تم تحديث الصلاحية"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mReset = useMutation({
    mutationFn: () => reset({ data: { userId: pwTarget!.userId, password: newPw } }),
    onSuccess: () => { toast.success("تم تحديث كلمة المرور"); pwDlg.hide(); setNewPw(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (userId: string) => delFn({ data: { userId } }),
    onSuccess: () => { toast.success("تم حذف الحساب"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (myRole !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للمديرين فقط</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <PageHeader title="المستخدمون" subtitle={`${data.length} مستخدم`}
        actions={<Btn onClick={() => newDlg.show()}><Plus className="w-4 h-4 inline ml-1" />مستخدم جديد</Btn>} />

      {isLoading ? <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p> :
       data.length === 0 ? <EmptyState title="لا يوجد مستخدمون" /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-right p-3 font-medium">الاسم</th>
                  <th className="text-right p-3 font-medium">البريد</th>
                  <th className="text-right p-3 font-medium">الصلاحية</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.user_id} className="border-t">
                    <td className="p-3 font-medium">{u.full_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-muted-foreground text-xs" dir="ltr">{u.email}</td>
                    <td className="p-3">
                      <select value={u.role ?? "seller"} disabled={mSetRole.isPending}
                        onChange={(e) => mSetRole.mutate({ userId: u.user_id, role: e.target.value as "admin" | "seller" })}
                        className="h-9 px-3 rounded-lg border bg-background text-sm">
                        <option value="seller">بائع</option>
                        <option value="admin">مدير</option>
                      </select>
                    </td>
                    <td className="p-3 whitespace-nowrap text-left">
                      <button onClick={() => { setPwTarget({ userId: u.user_id, email: u.email }); setNewPw(""); pwDlg.show(); }}
                        className="p-2 hover:bg-muted rounded-lg" title="كلمة مرور جديدة"><Key className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm(`حذف الحساب ${u.email}؟`)) mDel.mutate(u.user_id); }}
                        className="p-2 hover:bg-destructive/10 text-destructive rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={newDlg.open} onClose={newDlg.hide} title="إضافة مستخدم جديد"
        footer={<>
          <Btn variant="outline" onClick={newDlg.hide}>إلغاء</Btn>
          <Btn onClick={() => mCreate.mutate()} disabled={mCreate.isPending || !form.email || !form.password}>إنشاء</Btn>
        </>}>
        <div className="space-y-3">
          <Field label="الاسم الكامل"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="البريد *"><Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="كلمة المرور *"><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="6 أحرف على الأقل" /></Field>
          <Field label="الصلاحية">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "seller" })}
              className="w-full h-11 px-3 rounded-lg border bg-background">
              <option value="seller">بائع</option>
              <option value="admin">مدير</option>
            </select>
          </Field>
        </div>
      </Modal>

      <Modal open={pwDlg.open} onClose={pwDlg.hide} title={`تغيير كلمة المرور — ${pwTarget?.email ?? ""}`}
        footer={<>
          <Btn variant="outline" onClick={pwDlg.hide}>إلغاء</Btn>
          <Btn onClick={() => mReset.mutate()} disabled={mReset.isPending || newPw.length < 6}>حفظ</Btn>
        </>}>
        <Field label="كلمة مرور جديدة"><Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="6 أحرف على الأقل" /></Field>
      </Modal>
    </div>
  );
}
