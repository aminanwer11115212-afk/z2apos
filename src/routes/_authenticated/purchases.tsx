import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { PaymentMethod, paymentMethodIcon } from "@/lib/payments";
import { Field, Input, Btn, PageHeader, EmptyState } from "@/components/ui-kit";
import { Plus, Minus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchases")({ head: () => ({ meta: [{ title: "المشتريات — 2A" }] }), component: PurchasesPage });

type Part = { id: string; code: string; name: string; cost_price: number };
type Line = { part: Part; qty: number; unit_cost: number };

type Purchase = { id: string; invoice_no: number; total: number; paid: number; created_at: string; suppliers: { name: string } | null };

function PurchasesPage() {
  const qc = useQueryClient(); const nav = useNavigate(); const [creating, setCreating] = useState(false);
  const { data: list = [] } = useQuery({
    queryKey: ["purchases-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("id,invoice_no,total,paid,created_at, suppliers(name)").order("created_at", { ascending: false }).limit(200);
      if (error) throw error; return data as unknown as Purchase[];
    },
  });
  if (creating) return <NewPurchase onDone={() => { setCreating(false); qc.invalidateQueries(); nav({ to: "/purchases" }); }} onCancel={() => setCreating(false)} />;
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="فواتير المشتريات" subtitle={`${list.length} فاتورة`} actions={<Btn onClick={() => setCreating(true)}><Plus className="w-4 h-4 inline ml-1" />فاتورة شراء</Btn>} />
      {list.length === 0 ? <EmptyState title="لا توجد فواتير مشتريات" /> : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="text-right p-3 font-medium">#</th><th className="text-right p-3 font-medium">التاريخ</th><th className="text-right p-3 font-medium">المورد</th><th className="text-right p-3 font-medium">الإجمالي</th><th className="text-right p-3 font-medium">المستحق</th></tr></thead>
            <tbody>
              {list.map((p) => { const due = Number(p.total) - Number(p.paid); return (
                <tr key={p.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-mono"><Link to="/purchases/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.invoice_no}</Link></td>
                  <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-3">{p.suppliers?.name ?? "—"}</td>
                  <td className="p-3 font-semibold">{formatSDG(p.total)}</td>
                  <td className={`p-3 font-semibold ${due > 0 ? "text-destructive" : "text-success"}`}>{formatSDG(due)}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const METHOD_ORDER: PaymentMethod[] = ["cash", "bank", "wallet"];
const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "نقدي", bank: "بنكي", wallet: "محفظة", transfer: "تحويل", credit: "آجل" };

function NewPurchase({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const settings = useSettings();
  const [q, setQ] = useState(""); const [lines, setLines] = useState<Line[]>([]); const [supplierId, setSupplierId] = useState("");
  const [paid, setPaid] = useState(0); const [method, setMethod] = useState<PaymentMethod>(settings.defaultMethod);
  const [accountId, setAccountId] = useState(settings.paymentMethods[method]?.defaultAccountId ?? ""); const [txRef, setTxRef] = useState(""); const [notes, setNotes] = useState("");
  const { data: parts = [] } = useQuery({ queryKey: ["parts-lite-cost"], queryFn: async () => { const { data, error } = await supabase.from("parts").select("id,code,name,cost_price").order("name"); if (error) throw error; return data as Part[]; } });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-lite"], queryFn: async () => { const { data, error } = await supabase.from("suppliers").select("id,name").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });
  const results = useMemo(() => !q ? [] : parts.filter((p) => p.code.includes(q) || p.name.includes(q)).slice(0, 8), [q, parts]);
  const addPart = (p: Part) => { setLines((prev) => { const i = prev.findIndex((l) => l.part.id === p.id); if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; } return [...prev, { part: p, qty: 1, unit_cost: Number(p.cost_price) }]; }); setQ(""); };
  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const isDigital = method === "bank" || method === "wallet";
  const account = settings.accounts.find((a) => a.id === accountId);
  const availableAccounts = isDigital ? settings.accounts.filter((a) => a.type === "bank" || a.type === "wallet") : settings.accounts.filter((a) => a.type === "cash");
  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
      const { data: userRes } = await supabase.auth.getUser();
      const finalNotes = [txRef.trim() ? `مرجع: ${txRef.trim()}` : "", notes.trim()].filter(Boolean).join(" · ") || null;
      const { data: pur, error: e1 } = await supabase.from("purchases").insert({ supplier_id: supplierId || null, paid, notes: finalNotes, created_by: userRes.user?.id ?? null, payment_method: method, account_name: account?.name ?? null }).select("id,invoice_no").single();
      if (e1) throw e1;
      const items = lines.map((l) => ({ purchase_id: pur.id, part_id: l.part.id, qty: l.qty, unit_cost: l.unit_cost }));
      const { error: e2 } = await supabase.from("purchase_items").insert(items);
      if (e2) throw e2; return pur;
    },
    onSuccess: (p) => { toast.success(`تم حفظ فاتورة الشراء #${p.invoice_no}`); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="فاتورة شراء جديدة" actions={<Btn variant="outline" onClick={onCancel}>إلغاء</Btn>} />
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <div className="relative">
            <div className="flex items-center gap-2 h-12 px-3 rounded-xl border bg-card"><Search className="w-4 h-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="ابحث عن قطعة لإضافتها..." className="flex-1 bg-transparent outline-none" /></div>
            {results.length > 0 && (
              <div className="absolute z-10 top-full mt-1 inset-x-0 bg-card border rounded-xl shadow-lg overflow-hidden">
                {results.map((p) => (
                  <button key={p.id} onClick={() => addPart(p)} type="button" className="w-full text-right px-4 py-3 hover:bg-muted flex items-center justify-between border-b last:border-0">
                    <div><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground font-mono">{p.code}</div></div>
                    <div className="font-semibold text-primary">{formatSDG(p.cost_price)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card border rounded-2xl overflow-hidden">
            {lines.length === 0 ? <div className="p-8 text-center text-muted-foreground">أضف قطعة للبدء</div> : (
              <div className="divide-y">
                {lines.map((l) => (
                  <div key={l.part.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><div className="font-medium truncate">{l.part.name}</div><div className="text-xs text-muted-foreground font-mono">{l.part.code}</div></div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setLines((p) => p.map((x) => x.part.id === l.part.id ? { ...x, qty: Math.max(0.01, x.qty - 1) } : x))} className="w-8 h-8 rounded-lg border hover:bg-muted"><Minus className="w-4 h-4 mx-auto" /></button>
                      <input type="number" step="0.01" value={l.qty} onChange={(e) => setLines((p) => p.map((x) => x.part.id === l.part.id ? { ...x, qty: Math.max(0.01, Number(e.target.value)) } : x))} className="w-14 h-8 text-center rounded-lg border bg-background" />
                      <button onClick={() => setLines((p) => p.map((x) => x.part.id === l.part.id ? { ...x, qty: x.qty + 1 } : x))} className="w-8 h-8 rounded-lg border hover:bg-muted"><Plus className="w-4 h-4 mx-auto" /></button>
                    </div>
                    <input type="number" step="0.01" value={l.unit_cost} onChange={(e) => setLines((p) => p.map((x) => x.part.id === l.part.id ? { ...x, unit_cost: Math.max(0, Number(e.target.value)) } : x))} className="w-24 h-8 px-2 rounded-lg border bg-background text-sm" />
                    <div className="w-24 text-left font-semibold text-sm">{formatSDG(l.qty * l.unit_cost)}</div>
                    <button onClick={() => setLines((p) => p.filter((x) => x.part.id !== l.part.id))} className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <aside className="bg-card border rounded-2xl p-4 space-y-3 h-fit lg:sticky lg:top-20">
          <Field label="المورد"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background"><option value="">— بدون —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="المدفوع"><Input type="number" step="0.01" value={paid} onChange={(e) => setPaid(Number(e.target.value) || 0)} /></Field>
          <Field label="طريقة الدفع">
            <div className="grid grid-cols-3 gap-2">
              {METHOD_ORDER.map((m) => (
                <button key={m} type="button" onClick={() => { setMethod(m); setAccountId(settings.paymentMethods[m]?.defaultAccountId ?? ""); }} className={`h-10 rounded-lg border text-sm font-medium ${method === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                  {paymentMethodIcon(m)} {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={isDigital ? "الحساب" : "صندوق النقد"}>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
              {availableAccounts.map((a) => <option key={a.id} value={a.id}>{a.type === "cash" ? "💵" : a.type === "wallet" ? "📱" : "🏦"} {a.name}</option>)}
            </select>
          </Field>
          {isDigital && <Field label="رقم العملية"><Input value={txRef} onChange={(e) => setTxRef(e.target.value)} dir="ltr" className="font-mono text-right" /></Field>}
          <Field label="ملاحظات"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>الإجمالي</span><span>{formatSDG(total)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>المدفوع</span><span>- {formatSDG(paid)}</span></div>
            <div className="flex justify-between font-bold text-base pt-2 border-t"><span>المستحق</span><span className={total - paid > 0 ? "text-destructive" : "text-success"}>{formatSDG(Math.max(0, total - paid))}</span></div>
          </div>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0} className="w-full">حفظ الفاتورة</Btn>
        </aside>
      </div>
    </div>
  );
}
