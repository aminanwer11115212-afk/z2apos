import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Field, Input, Btn, PageHeader } from "@/components/ui-kit";
import { useSettings, saveSettings, type AccountType, type Account, type PaymentMethodKey } from "@/lib/settings";
import { Plus, Trash2, CreditCard, Banknote, Smartphone, Percent, Shield, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ head: () => ({ meta: [{ title: "الإعدادات — 2A" }] }), component: SettingsPage });

const ACC_TYPES: { v: AccountType; label: string; icon: ReactNode }[] = [
  { v: "cash", label: "نقدي", icon: <Banknote className="w-5 h-5 text-success" /> },
  { v: "bank", label: "بنكي", icon: <CreditCard className="w-5 h-5 text-primary" /> },
  { v: "wallet", label: "محفظة", icon: <Smartphone className="w-5 h-5 text-purple-500" /> },
];
const PAY_META: Record<PaymentMethodKey, { icon: string; label: string }> = { cash: { icon: "💵", label: "نقدي" }, bank: { icon: "🏦", label: "بنكي" }, wallet: { icon: "📱", label: "محفظة" } };
function newId() { return (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)); }

function SettingsPage() {
  const s = useSettings();
  const [newAcc, setNewAcc] = useState({ name: "", type: "bank" as AccountType, note: "" });
  const add = () => { if (!newAcc.name.trim()) return toast.error("الاسم مطلوب"); saveSettings({ accounts: [...s.accounts, { id: newId(), name: newAcc.name.trim(), type: newAcc.type, note: newAcc.note.trim() || undefined }] }); setNewAcc({ name: "", type: "bank", note: "" }); toast.success("تمت الإضافة"); };
  const remove = (id: string) => { if (s.accounts.length <= 1) return toast.error("يجب حساب واحد على الأقل"); const next = s.accounts.filter((a) => a.id !== id); saveSettings({ accounts: next, defaultAccountId: s.defaultAccountId === id ? next[0].id : s.defaultAccountId }); };
  const accIcon = (type: AccountType) => ACC_TYPES.find((t) => t.v === type)?.icon ?? <CreditCard className="w-5 h-5" />;
  const accLabel = (type: AccountType) => ACC_TYPES.find((t) => t.v === type)?.label ?? type;
  const updPay = (k: PaymentMethodKey, p: object) => saveSettings({ paymentMethods: { ...s.paymentMethods, [k]: { ...s.paymentMethods[k], ...p } } });
  const eligible = (k: PaymentMethodKey) => k === "cash" ? s.accounts.filter((a) => a.type === "cash") : s.accounts.filter((a) => a.type === "bank" || a.type === "wallet");

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="الإعدادات" subtitle="الحسابات والدفع والصلاحيات" />

      <Section title="بيانات المتجر" icon={<Wallet className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="اسم المتجر"><Input value={s.storeName} onChange={(e) => saveSettings({ storeName: e.target.value })} /></Field>
          <Field label="الهاتف"><Input value={s.storePhone} onChange={(e) => saveSettings({ storePhone: e.target.value })} /></Field>
          <Field label="العنوان"><Input value={s.storeAddress} onChange={(e) => saveSettings({ storeAddress: e.target.value })} /></Field>
          <Field label="الرقم الضريبي / السجل"><Input value={s.storeTaxNo} onChange={(e) => saveSettings({ storeTaxNo: e.target.value })} /></Field>
          <Field label="نص أسفل الفاتورة"><Input value={s.invoiceFooter} onChange={(e) => saveSettings({ invoiceFooter: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="الضريبة والطباعة" icon={<Percent className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="تفعيل الضريبة"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.taxEnabled} onChange={(e) => saveSettings({ taxEnabled: e.target.checked })} /><span className="text-sm">إظهار الضريبة</span></label></Field>
          <Field label="نسبة الضريبة %"><Input type="number" min={0} max={100} step="0.01" value={s.taxPercent} onChange={(e) => saveSettings({ taxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></Field>
          <Field label="بادئة رقم الفاتورة"><Input value={s.invoicePrefix} onChange={(e) => saveSettings({ invoicePrefix: e.target.value })} placeholder="INV-" /></Field>
          <Field label="عدد نسخ الطباعة"><Input type="number" min={1} max={5} value={s.printCopies} onChange={(e) => saveSettings({ printCopies: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          <Field label="حد المخزون المنخفض"><Input type="number" min={0} value={s.lowStockDefault} onChange={(e) => saveSettings({ lowStockDefault: Math.max(0, Number(e.target.value) || 0)) })} /></Field>
        </div>
      </Section>

      <Section title="الحسابات المالية" icon={<Banknote className="w-4 h-4" />}>
        <div className="space-y-2 mb-3">{s.accounts.map((a) => <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">{accIcon(a.type)}<div className="flex-1 min-w-0"><div className="font-medium">{a.name}</div><div className="text-xs text-muted-foreground">{accLabel(a.type)}{a.note ? ` · ${a.note}` : ""}</div></div><label className="flex items-center gap-1 text-xs"><input type="radio" name="def-acc" checked={s.defaultAccountId === a.id} onChange={() => saveSettings({ defaultAccountId: a.id })} />افتراضي</label><button onClick={() => remove(a.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-4 h-4" /></button></div>)}</div>
        <div className="grid sm:grid-cols-[1fr,140px,1fr,auto] gap-2 items-end p-3 rounded-lg border bg-muted/30">
          <Field label="اسم الحساب"><Input value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="مثال: بنك الخرطوم" /></Field>
          <Field label="النوع"><select value={newAcc.type} onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value as AccountType })} className="w-full h-11 px-3 rounded-lg border bg-background">{ACC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></Field>
          <Field label="ملاحظة"><Input value={newAcc.note} onChange={(e) => setNewAcc({ ...newAcc, note: e.target.value })} /></Field>
          <Btn onClick={add}><Plus className="w-4 h-4 inline ml-1" />إضافة</Btn>
        </div>
      </Section>

      <Section title="طرق الدفع" icon={<Wallet className="w-4 h-4" />}>
        <p className="text-xs text-muted-foreground mb-3">تفعيل/تعطيل الطرق، اختيار الحساب الافتراضي، وإلزام رقم العملية.</p>
        {(["cash", "bank", "wallet"] as PaymentMethodKey[]).map((k) => { const cfg = s.paymentMethods[k], el = eligible(k); return (
          <div key={k} className="p-3 rounded-lg border bg-card mb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div className="font-medium">{PAY_META[k].icon} {PAY_META[k].label}</div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.enabled} onChange={(e) => updPay(k, { enabled: e.target.checked })} />مفعّلة</label>
                <label className="flex items-center gap-1"><input type="radio" name="def-method" checked={s.defaultMethod === k} onChange={() => saveSettings({ defaultMethod: k })} />افتراضية</label>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="الحساب الافتراضي"><select value={cfg.defaultAccountId} onChange={(e) => updPay(k, { defaultAccountId: e.target.value })} className="w-full h-10 px-2 rounded-lg border bg-background text-sm">{el.length === 0 && <option value="">— لا يوجد حساب —</option>}{el.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="رقم العملية"><label className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-background cursor-pointer text-sm"><input type="checkbox" checked={cfg.requireRef} onChange={(e) => updPay(k, { requireRef: e.target.checked })} />يتطلب رقم عملية</label></Field>
            </div>
          </div>
        ); })}</Section>

      <Section title="صلاحيات البائع" icon={<Shield className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="رؤية سعر التكلفة"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.sellerPerms.seeCost} onChange={(e) => saveSettings({ sellerPerms: { ...s.sellerPerms, seeCost: e.target.checked } })} /><span className="text-sm">يستطيع رؤية التكلفة</span></label></Field>
          <Field label="تعديل السعر في البيع"><label className="flex items-center gap-2 h-11 px-3 rounded-lg border bg-background cursor-pointer"><input type="checkbox" checked={s.sellerPerms.editPrice} onChange={(e) => saveSettings({ sellerPerms: { ...s.sellerPerms, editPrice: e.target.checked } })} /><span className="text-sm">يستطيع تعديل السعر</span></label></Field>
          <Field label="أقصى نسبة خصم %"><Input type="number" min={0} max={100} value={s.sellerPerms.maxDiscountPercent} onChange={(e) => saveSettings({ sellerPerms: { ...s.sellerPerms, maxDiscountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })} /></Field>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="bg-card border rounded-2xl p-4"><h2 className="font-bold mb-3 flex items-center gap-2">{icon}{title}</h2>{children}</section>;
}
