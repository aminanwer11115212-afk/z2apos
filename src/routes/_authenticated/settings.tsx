import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Field, Input, Btn, PageHeader } from "@/components/ui-kit";
import { useSettings, saveSettings, type AccountType, type Account, type PrintFormat, type PaymentMethodKey } from "@/lib/settings";
import { Plus, Trash2, CreditCard, Banknote, Smartphone, Printer, Percent, MessageCircle, Shield, Image as ImageIcon, Store, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ head: () => ({ meta: [{ title: "الإعدادات — 2A" }] }), component: SettingsPage });

const ACCOUNT_TYPES: { v: AccountType; label: string; icon: React.ReactNode }[] = [
  { v: "cash", label: "نقدي", icon: <Banknote className="w-5 h-5 text-success" /> },
  { v: "bank", label: "بنكي", icon: <CreditCard className="w-5 h-5 text-primary" /> },
  { v: "wallet", label: "محفظة", icon: <Smartphone className="w-5 h-5 text-purple-500" /> },
];

function SettingsPage() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newAcc, setNewAcc] = useState<{ name: string; type: AccountType; note: string }>({ name: "", type: "bank", note: "" });

  const addAccount = () => {
    if (!newAcc.name.trim()) return toast.error("الاسم مطلوب");
    const acc: Account = { id: crypto.randomUUID(), name: newAcc.name.trim(), type: newAcc.type, note: newAcc.note.trim() || undefined };
    saveSettings({ accounts: [...s.accounts, acc] });
    setNewAcc({ name: "", type: "bank", note: "" });
    toast.success("تمت الإضافة");
  };
  const removeAccount = (id: string) => {
    if (s.accounts.length <= 1) return toast.error("يجب أن يبقى حساب واحد على الأقل");
    const next = s.accounts.filter((a) => a.id !== id);
    saveSettings({ accounts: next, defaultAccountId: s.defaultAccountId === id ? next[0].id : s.defaultAccountId });
  };
  const accountIcon = (type: AccountType) => ACCOUNT_TYPES.find((t) => t.v === type)?.icon ?? <CreditCard className="w-5 h-5" />;
  const accountLabel = (type: AccountType) => ACCOUNT_TYPES.find((t) => t.v === type)?.label ?? type;

  const uploadLogo = (file: File) => {
    if (file.size > 500_000) return toast.error("حجم الصورة كبير — الحد ~500KB");
    const reader = new FileReader();
    reader.onload = () => { saveSettings({ customLogoUrl: String(reader.result) }); toast.success("تم تحديث الشعار"); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="الإعدادات" subtitle="النظام والطباعة والحسابات والصلاحيات" />

      <Section title="بيانات المتجر" icon={<Store className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="اسم المتجر"><Input value={s.storeName} onChange={(e) => saveSettings({ storeName: e.target.value })} /></Field>
          <Field label="الهاتف"><Input value={s.storePhone} onChange={(e) => saveSettings({ storePhone: e.target.value })} /></Field>
          <Field label="العنوان"><Input value={s.storeAddress} onChange={(e) => saveSettings({ storeAddress: e.target.value })} /></Field>
          <Field label="الرقم الضريبي / السجل"><Input value={s.storeTaxNo} onChange={(e) => saveSettings({ storeTaxNo: e.target.value })} /></Field>
          <Field label="نص أسفل الفاتورة"><Input value={s.invoiceFooter} onChange={(e) => saveSettings({ invoiceFooter: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="الشعار المخصّص" icon={<ImageIcon className="w-4 h-4" />}>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl border bg-muted flex items-center justify-center overflow-hidden">
            {s.customLogoUrl ? <img src={s.customLogoUrl} alt="logo" className="max-w-full max-h-full" /> : <span className="text-xs text-muted-foreground">الافتراضي</span>}
          </div>
          <div className="flex-1 space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            <div className="flex gap-2 flex-wrap"><Btn variant="outline" onClick={() => fileRef.current?.click()}>رفع شعار</Btn>{s.customLogoUrl && <Btn variant="outline" onClick={() => saveSettings({ customLogoUrl: null })}>إزالة</Btn>}</div>
            <p className="text-xs text-muted-foreground">PNG/JPG صغيرة — يفضّل بخلفية شفافة. يظهر في الفواتير والتقارير.</p>
          </div>
        </div>
      </Section>

      <Section title="الضريبة وترقيم الفواتير" icon={<Percent className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="تفعيل الضريبة"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.taxEnabled} onChange={(e) => saveSettings({ taxEnabled: e.target.checked })} /><span className="text-sm">إظهار الضريبة في الفاتورة</span></label></Field>
          <Field label="نسبة الضريبة %"><Input type="number" min={0} max={100} step="0.01" value={s.taxPercent} onChange={(e) => saveSettings({ taxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></Field>
          <Field label="بادئة رقم الفاتورة"><Input value={s.invoicePrefix} onChange={(e) => saveSettings({ invoicePrefix: e.target.value })} placeholder="مثال: INV-" /></Field>
          <Field label="حد المخزون المنخفض (افتراضي)"><Input type="number" min={0} value={s.lowStockDefault} onChange={(e) => saveSettings({ lowStockDefault: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        </div>
      </Section>

      <Section title="إعدادات الطباعة" icon={<Printer className="w-4 h-4" />}>
        <Field label="نوع الطابعة">
          <div className="grid grid-cols-3 gap-2">
            {([{ v: "a4", label: "A4 عادي" }, { v: "thermal80", label: "حراري 80mm" }, { v: "thermal58", label: "حراري 58mm" }] as { v: PrintFormat; label: string }[]).map((o) => (
              <button key={o.v} onClick={() => saveSettings({ printFormat: o.v })} className={`h-11 rounded-lg border text-sm font-medium ${s.printFormat === o.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{o.label}</button>
            ))}
          </div>
        </Field>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="عدد النسخ"><Input type="number" min={1} max={5} value={s.printCopies} onChange={(e) => saveSettings({ printCopies: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          <Field label="إظهار الشعار"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.showLogo} onChange={(e) => saveSettings({ showLogo: e.target.checked })} /><span className="text-sm">إظهار شعار المتجر في الفاتورة</span></label></Field>
        </div>
      </Section>

      <Section title="الحسابات المالية" icon={<Banknote className="w-4 h-4" />}>
        <div className="space-y-2 mb-3">
          {s.accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              {accountIcon(a.type)}
              <div className="flex-1 min-w-0">
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">{accountLabel(a.type)}{a.note ? ` · ${a.note}` : ""}</div>
              </div>
              <label className="flex items-center gap-1 text-xs"><input type="radio" name="def-acc" checked={s.defaultAccountId === a.id} onChange={() => saveSettings({ defaultAccountId: a.id })} />افتراضي</label>
              <button onClick={() => removeAccount(a.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-[1fr,140px,1fr,auto] gap-2 items-end p-3 rounded-lg border bg-muted/30">
          <Field label="اسم الحساب"><Input value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="مثال: بنك الخرطوم" /></Field>
          <Field label="النوع">
            <select value={newAcc.type} onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value as AccountType })} className="w-full h-11 px-3 rounded-lg border bg-background">
              {ACCOUNT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="ملاحظة (رقم الحساب...)"><Input value={newAcc.note} onChange={(e) => setNewAcc({ ...newAcc, note: e.target.value })} /></Field>
          <Btn onClick={addAccount}><Plus className="w-4 h-4 inline ml-1" />إضافة</Btn>
        </div>
      </Section>

      <Section title="طرق الدفع" icon={<Wallet className="w-4 h-4" />}>
        <p className="text-xs text-muted-foreground mb-3">تفعيل/تعطيل الطرق، اختيار الحساب الافتراضي، وإلزام كتابة رقم العملية.</p>
        <div className="space-y-2">
          {(["cash", "bank", "wallet"] as PaymentMethodKey[]).map((k) => {
            const cfg = s.paymentMethods[k];
            const meta = { cash: { icon: "💵", label: "نقدي" }, bank: { icon: "🏦", label: "بنكي" }, wallet: { icon: "📱", label: "محفظة" } }[k];
            const eligible = s.accounts.filter((a) => k === "cash" ? a.type === "cash" : (a.type === "bank" || a.type === "wallet"));
            return (
              <div key={k} className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <div className="font-medium">{meta.icon} {meta.label}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.enabled} onChange={(e) => saveSettings({ paymentMethods: { ...s.paymentMethods, [k]: { ...cfg, enabled: e.target.checked } } })} />مفعّلة</label>
                    <label className="flex items-center gap-1"><input type="radio" name="def-method" checked={s.defaultMethod === k} onChange={() => saveSettings({ defaultMethod: k })} />افتراضية</label>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Field label="الحساب الافتراضي">
                    <select value={cfg.defaultAccountId} onChange={(e) => saveSettings({ paymentMethods: { ...s.paymentMethods, [k]: { ...cfg, defaultAccountId: e.target.value } } })} className="w-full h-10 px-2 rounded-lg border bg-background text-sm">
                      {eligible.length === 0 && <option value="">— لا يوجد حساب —</option>}
                      {eligible.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Field>
                  <Field label="رقم العملية"><label className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-background cursor-pointer text-sm"><input type="checkbox" checked={cfg.requireRef} onChange={(e) => saveSettings({ paymentMethods: { ...s.paymentMethods, [k]: { ...cfg, requireRef: e.target.checked } } })} />يتطلب رقم عملية عند الحفظ</label></Field>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="صلاحيات البائع" icon={<Shield className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="رؤية سعر التكلفة"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.sellerPerms.seeCost} onChange={(e) => saveSettings({ sellerPerms: { ...s.sellerPerms, seeCost: e.target.checked } })} /><span className="text-sm">يستطيع رؤية التكلفة</span></label></Field>
          <Field label="تعديل السعر في البيع"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.sellerPerms.editPrice} onChange={(e) => saveSettings({ sellerPerms: { ...s.sellerPerms, editPrice: e.target.checked } })} /><span className