import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { useMyRole } from "@/lib/auth";
import { PageHeader, Btn } from "@/components/ui-kit";
import { toast } from "sonner";
import {
  adminExportAll,
  adminImportAll,
  adminSeedDemo,
  adminWipeData,
} from "@/lib/admin.functions";
import { Download, Upload, Sparkles, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/data")({
  head: () => ({ meta: [{ title: "البيانات — 2A" }] }),
  component: DataPage,
});

function DataPage() {
  const qc = useQueryClient();
  const { data: role } = useMyRole();
  const exportFn = useServerFn(adminExportAll);
  const importFn = useServerFn(adminImportAll);
  const seedFn = useServerFn(adminSeedDemo);
  const wipeFn = useServerFn(adminWipeData);
  const fileRef = useRef<HTMLInputElement>(null);
  const [wipeFirst, setWipeFirst] = useState(false);

  const mExport = useMutation({
    mutationFn: () => exportFn(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `2a-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم التصدير");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mImport = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload?.tables) throw new Error("ملف غير صالح");
      return importFn({ data: { payload, wipeFirst } });
    },
    onSuccess: (r) => {
      toast.success(`تم الاستيراد: ${Object.values(r.counts).reduce((a, b) => a + b, 0)} صف`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSeed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r) => {
      toast.success(`تم إنشاء ${r.parts} منتج و${r.sales} فاتورة`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mWipe = useMutation({
    mutationFn: () => wipeFn(),
    onSuccess: () => {
      toast.success("تم مسح البيانات");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin")
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للمديرين فقط</div>;

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      <PageHeader title="البيانات" subtitle="نسخ احتياطي، استيراد، بيانات تجريبية" />

      <section className="bg-card border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          <h2 className="font-bold">تصدير نسخة احتياطية</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          تنزيل ملف JSON يحوي كل البيانات (باستثناء حسابات المستخدمين).
        </p>
        <Btn onClick={() => mExport.mutate()} disabled={mExport.isPending}>
          {mExport.isPending ? "جارٍ التصدير..." : "تنزيل النسخة الاحتياطية"}
        </Btn>
      </section>

      <section className="bg-card border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          <h2 className="font-bold">استيراد نسخة احتياطية</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          اختر ملف JSON صادر من نظام 2A. يتم الدمج حسب المعرّف (id).
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={wipeFirst}
            onChange={(e) => setWipeFirst(e.target.checked)}
          />
          <span>مسح البيانات الحالية أولاً</span>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (wipeFirst && !confirm("⚠️ سيتم مسح كل البيانات ثم الاستيراد. متأكد؟")) {
              e.target.value = "";
              return;
            }
            if (wipeFirst && !confirm("تأكيد نهائي: هل تريد المتابعة فعلاً؟")) {
              e.target.value = "";
              return;
            }
            mImport.mutate(f);
            e.target.value = "";
          }}
        />
        <Btn
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={mImport.isPending}
        >
          {mImport.isPending ? "جارٍ الاستيراد..." : "اختيار ملف..."}
        </Btn>
      </section>

      <section className="bg-card border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-bold">بيانات تجريبية</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          يُنشئ ١٠٠٠ منتج + ٥٠ عميل + ٢٠ مورّد + ٢٠٠ فاتورة مشتريات + ١٠٠٠ فاتورة مبيعات موزّعة على
          آخر سنة. العملية قد تستغرق دقيقة.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Btn
            onClick={() => {
              if (confirm("إنشاء بيانات تجريبية؟")) mSeed.mutate();
            }}
            disabled={mSeed.isPending}
          >
            {mSeed.isPending ? "جارٍ الإنشاء..." : "إنشاء بيانات تجريبية"}
          </Btn>
        </div>
      </section>

      <section className="bg-card border border-destructive/40 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          <h2 className="font-bold text-destructive">مسح كل البيانات</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          يحذف كل قطع الغيار والعملاء والموردين والفواتير. لا يحذف حسابات المستخدمين.
          <strong className="text-destructive"> لا يمكن التراجع.</strong>
        </p>
        <Btn
          variant="danger"
          disabled={mWipe.isPending}
          onClick={() => {
            if (!confirm("⚠️ سيتم حذف كل البيانات بشكل نهائي. متأكد؟")) return;
            if (!confirm("تأكيد نهائي: لن تستطيع استرجاعها.")) return;
            mWipe.mutate();
          }}
        >
          {mWipe.isPending ? "جارٍ المسح..." : "مسح كل البيانات"}
        </Btn>
      </section>
    </div>
  );
}
