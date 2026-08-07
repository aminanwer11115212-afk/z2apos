import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { PageHeader, Field, Input } from "@/components/ui-kit";
import { Banknote, CreditCard, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { useSettings, parseNotes, type Account } from "@/lib/settings";

type Payment = {
  id: string;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  account_name: string | null;
  notes: string | null;
  created_at: string;
  customer_id: string | null;
  supplier_id: string | null;
  sale_id: string | null;
  purchase_id: string | null;
};

type PaidInvoice = {
  id: string;
  invoice_no: number;
  paid: number;
  account_name: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
};

// حركة موحّدة: دفعات ledger + المقبوض عند إنشاء فواتير البيع/الشراء
type Movement = {
  id: string;
  direction: "in" | "out";
  amount: number;
  account_name: string | null;
  label: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "الحسابات — 2A" }] }),
  component: AccountsPage,
});

const typeIcon: Record<Account["type"], React.ReactNode> = {
  cash: <Banknote className="w-5 h-5 text-success" />,
  bank: <CreditCard className="w-5 h-5 text-primary" />,
  wallet: <Wallet className="w-5 h-5 text-warning" />,
};
const typeLabel: Record<Account["type"], string> = { cash: "نقدي", bank: "بنكي", wallet: "محفظة" };

function AccountsPage() {
  const settings = useSettings();
  const accounts = settings.accounts;
  const [selected, setSelected] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: payments = [] } = useQuery({
    queryKey: ["payments-all", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id,direction,amount,method,account_name,notes,created_at,customer_id,supplier_id,sale_id,purchase_id",
        )
        .order("created_at", { ascending: false });
      if (dateFrom) q = q.gte("created_at", dateFrom + "T00:00:00");
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const { data: paidSales = [] } = useQuery({
    queryKey: ["accounts-paid-sales", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id,invoice_no,paid,account_name,payment_method,notes,created_at")
        .gt("paid", 0)
        .order("created_at", { ascending: false });
      if (dateFrom) q = q.gte("created_at", dateFrom + "T00:00:00");
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaidInvoice[];
    },
  });

  const { data: paidPurchases = [] } = useQuery({
    queryKey: ["accounts-paid-purchases", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("purchases")
        .select("id,invoice_no,paid,account_name,payment_method,notes,created_at")
        .gt("paid", 0)
        .order("created_at", { ascending: false });
      if (dateFrom) q = q.gte("created_at", dateFrom + "T00:00:00");
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaidInvoice[];
    },
  });

  // sales.paid يشمل الدفعات اللاحقة المرتبطة بالفاتورة (المشغّل يزيده)،
  // لذلك نطرحها لاستخراج المقبوض عند الإنشاء فقط — بلا ازدواج مع صفوف payments.
  const movements = useMemo(() => {
    const linkedToSale = new Map<string, number>();
    const linkedToPurchase = new Map<string, number>();
    for (const p of payments) {
      if (p.sale_id)
        linkedToSale.set(p.sale_id, (linkedToSale.get(p.sale_id) ?? 0) + Number(p.amount));
      if (p.purchase_id)
        linkedToPurchase.set(
          p.purchase_id,
          (linkedToPurchase.get(p.purchase_id) ?? 0) + Number(p.amount),
        );
    }
    const list: Movement[] = payments.map((p) => ({
      id: p.id,
      direction: p.direction,
      amount: Number(p.amount),
      account_name: p.account_name,
      label: p.notes ?? (p.direction === "in" ? "تحصيل" : "سداد"),
      created_at: p.created_at,
    }));
    for (const s of paidSales) {
      const initial = Number(s.paid) - (linkedToSale.get(s.id) ?? 0);
      if (initial <= 0.009) continue;
      list.push({
        id: `sale-${s.id}`,
        direction: "in",
        amount: initial,
        account_name: s.account_name ?? parseNotes(s.notes).account,
        label: `فاتورة بيع #${s.invoice_no}`,
        created_at: s.created_at,
      });
    }
    for (const pu of paidPurchases) {
      const initial = Number(pu.paid) - (linkedToPurchase.get(pu.id) ?? 0);
      if (initial <= 0.009) continue;
      list.push({
        id: `purchase-${pu.id}`,
        direction: "out",
        amount: initial,
        account_name: pu.account_name ?? parseNotes(pu.notes).account,
        label: `فاتورة شراء #${pu.invoice_no}`,
        created_at: pu.created_at,
      });
    }
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [payments, paidSales, paidPurchases]);

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) m.set(a.name, 0);
    for (const p of movements) {
      if (!p.account_name) continue;
      const cur = m.get(p.account_name) ?? 0;
      m.set(p.account_name, cur + (p.direction === "in" ? p.amount : -p.amount));
    }
    return m;
  }, [movements, accounts]);

  const filtered = useMemo(() => {
    if (selected === "all") return movements;
    const name = accounts.find((a) => a.id === selected)?.name;
    return movements.filter((p) => p.account_name === name);
  }, [movements, selected, accounts]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    for (const p of filtered) {
      if (p.direction === "in") income += Number(p.amount);
      else expense += Number(p.amount);
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const totalBalance = useMemo(
    () => Array.from(balances.values()).reduce((s, v) => s + v, 0),
    [balances],
  );

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="الحسابات" subtitle="ملخص الحركات النقدية والبنكية والمحافظ" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelected(selected === a.id ? "all" : a.id)}
            className={`text-right p-4 rounded-2xl border bg-card hover:bg-muted transition-colors ${selected === a.id ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {typeIcon[a.type]}
              <span className="font-semibold">{a.name}</span>
            </div>
            <div className="text-2xl font-bold">{formatSDG(balances.get(a.name) ?? 0)}</div>
            <div className="text-xs text-muted-foreground">{typeLabel[a.type]}</div>
          </button>
        ))}
        <div className="p-4 rounded-2xl border bg-primary text-primary-foreground">
          <div className="text-sm opacity-90 mb-1">صافي الأرصدة</div>
          <div className="text-2xl font-bold">{formatSDG(totalBalance)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-success mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">إجمالي الوارد</span>
          </div>
          <div className="text-xl font-bold">{formatSDG(totals.income)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-medium">إجمالي الصادر</span>
          </div>
          <div className="text-xl font-bold">{formatSDG(totals.expense)}</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-sm font-medium mb-1">الصافي</div>
          <div
            className={`text-xl font-bold ${totals.net >= 0 ? "text-success" : "text-destructive"}`}
          >
            {formatSDG(totals.net)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelected("all")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${selected === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            الكل
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${selected === a.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {a.name}
            </button>
          ))}
        </div>
        <Field label="من">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="إلى">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-right p-3 font-medium">التاريخ</th>
              <th className="text-right p-3 font-medium">الحساب</th>
              <th className="text-right p-3 font-medium">الاتجاه</th>
              <th className="text-right p-3 font-medium">المبلغ</th>
              <th className="text-right p-3 font-medium">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/50">
                <td className="p-3">
                  {new Date(p.created_at).toLocaleString("ar-SD", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td className="p-3 font-medium">{p.account_name ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${p.direction === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                  >
                    {p.direction === "in" ? "وارد" : "صادر"}
                  </span>
                </td>
                <td className="p-3 font-semibold">{formatSDG(p.amount)}</td>
                <td className="p-3 text-muted-foreground">{p.label || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  لا توجد حركات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
