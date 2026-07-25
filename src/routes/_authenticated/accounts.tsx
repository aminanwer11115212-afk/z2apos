import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Btn, PageHeader, Field, Input, Modal, SearchBar, useDialog } from "@/components/ui-kit";
import { Plus, ArrowLeftRight, Banknote, CreditCard, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

type Account = { id: string; name: string; type: "cash" | "bank" | "wallet"; code: string | null; balance: number; is_default: boolean };
type Transaction = { id: string; account_id: string; type: string; amount: number; reference: string | null; notes: string | null; created_at: string; related_table: string | null; related_id: string | null };

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "الحسابات — 2A" }] }),
  component: AccountsPage,
});

const typeIcon: Record<string, React.ReactNode> = {
  cash: <Banknote className="w-5 h-5 text-success" />,
  bank: <CreditCard className="w-5 h-5 text-primary" />,
  wallet: <Wallet className="w-5 h-5 text-warning" />,
};
const typeLabel: Record<string, string> = { cash: "نقدي", bank: "بنكي", wallet: "محفظة" };

function AccountsPage() {
  const [selected, setSelected] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const addDialog = useDialog();
  const [newAcc, setNewAcc] = useState({ name: "", type: "cash" as const, code: "" });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("is_default", { ascending: false }).order("name");
      if (error) throw error; return data as Account[];
    },
  });

  const { data: txns = [] } = useQuery({
    queryKey: ["account-transactions", selected, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase.from("account_transactions").select("*").order("created_at", { ascending: false });
      if (selected !== "all") q = q.eq("account_id", selected);
      if (dateFrom) q = q.gte("created_at", dateFrom + "T00:00:00");
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error; return data as Transaction[];
    },
  });

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.balance), 0), [accounts]);
  const reports = useMemo(() => {
    let income = 0, expense = 0, transfersOut = 0;
    for (const t of txns) {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "expense") expense += Number(t.amount);
      else if (t.type === "transfer_out") transfersOut += Number(t.amount);
    }
    return { income, expense, transfersOut, net: income - expense };
  }, [txns]);

  const addAccount = async () => {
    if (!newAcc.name.trim()) return toast.error("الاسم مطلوب");
    const { error } = await supabase.from("accounts").insert({ name: newAcc.name.trim(), type: newAcc.type, code: newAcc.code.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة الحساب");
    setNewAcc({ name: "", type: "cash", code: "" });
    addDialog.hide();
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="الحسابات" subtitle="متابعة الحسابات والتدفقات النقدية"
        actions={<>
          <Link to="/accounts/transfer"><Btn variant="outline"><ArrowLeftRight className="w-4 h-4 inline ml-1" />تحويل</Btn></Link>
          <Btn onClick={addDialog.show}><Plus className="w-4 h-4 inline ml-1" />حساب جديد</Btn>
        </>} />

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {accounts.map((a) => (
          <button key={a.id} onClick={() => setSelected(selected === a.id ? "all" : a.id)}
            className={`text-right p-4 rounded-2xl border bg-card hover:bg-muted transition-colors ${selected === a.id ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {typeIcon[a.type]}
                <span className="font-semibold">{a.name}</span>
              </div>
              {a.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">افتراضي</span>}
            </div>
            <div className="text-2xl font-bold">{formatSDG(a.balance)}</div>
            <div className="text-xs text-muted-foreground">{typeLabel[a.type]}{a.code ? ` · ${a.code}` : ""}</div>
          </button>
        ))}
        <div className="p-4 rounded-2xl border bg-primary text-primary-foreground">
          <div className="text-sm opacity-90 mb-1">إجمالي الرصيد</div>
          <div className="text-2xl font-bold">{formatSDG(totalBalance)}</div>
        </div>
      </div>

      {/* Reports */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-success mb-1"><TrendingUp className="w-4 h-4" /><span className="text-sm font-medium">إجمالي الوارد</span></div>
          <div className="text-xl font-bold">{formatSDG(reports.income)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-destructive mb-1"><TrendingDown className="w-4 h-4" /><span className="text-sm font-medium">إجمالي الصادر</span></div>
          <div className="text-xl font-bold">{formatSDG(reports.expense)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-sm font-medium mb-1">الصافي (وارد - صادر)</div>
          <div className={`text-xl font-bold ${reports.net >= 0 ? "text-success" : "text-destructive"}`}>{formatSDG(reports.net)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2">
          <button onClick={() => setSelected("all")} className={`px-3 py-1.5 rounded-lg text-sm border ${selected === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>الكل</button>
          {accounts.map((a) => (
            <button key={a.id} onClick={() => setSelected(a.id)} className={`px-3 py-1.5 rounded-lg text-sm border ${selected === a.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{a.name}</button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <Field label="من"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="إلى"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right p-3 font-medium">التاريخ</th>
              <th className="text-right p-3 font-medium">الحساب</th>
              <th className="text-right p-3 font-medium">النوع</th>
              <th className="text-right p-3 font-medium">المبلغ</th>
              <th className="text-right p-3 font-medium">الرصيد</th>
              <th className="text-right p-3 font-medium">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => {
              const acc = accounts.find((a) => a.id === t.account_id);
              return (
                <tr key={t.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">{new Date(t.created_at).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-3 font-medium">{acc?.name ?? t.account_id}</td>
                  <td className="p-3"><TxnBadge type={t.type} /></td>
                  <td className="p-3 font-semibold">{formatSDG(t.amount)}</td>
                  <td className="p-3 text-muted-foreground">{formatSDG(acc?.balance ?? 0)}</td>
                  <td className="p-3 text-muted-foreground">{[t.reference, t.notes].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              );
            })}
            {txns.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد معاملات</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={addDialog.open} onClose={addDialog.hide} title="حساب جديد"
        footer={<>
          <Btn variant="outline" onClick={addDialog.hide}>إلغاء</Btn>
          <Btn onClick={addAccount} disabled={!newAcc.name.trim()}>حفظ</Btn>
        </>}>
        <div className="space-y-3">
          <Field label="الاسم *"><Input value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} /></Field>
          <Field label="النوع">
            <select value={newAcc.type} onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value as any })}
              className="w-full h-11 px-3 rounded-lg border bg-background">
              <option value="cash">نقدي</option>
              <option value="bank">بنكي</option>
              <option value="wallet">محفظة</option>
            </select>
          </Field>
          <Field label="الكود/الرقم"><Input value={newAcc.code} onChange={(e) => setNewAcc({ ...newAcc, code: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function TxnBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    income: { label: "وارد", cls: "bg-success/10 text-success" },
    expense: { label: "صادر", cls: "bg-destructive/10 text-destructive" },
    transfer_in: { label: "تحويل وارد", cls: "bg-primary/10 text-primary" },
    transfer_out: { label: "تحويل صادر", cls: "bg-warning/10 text-warning" },
  };
  const m = map[type] ?? { label: type, cls: "bg-muted" };
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
