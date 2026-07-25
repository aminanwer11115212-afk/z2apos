import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings, computeTax } from "@/lib/settings";
import { PaymentMethod } from "@/lib/payments";
import { Btn, PageHeader, Field, Input } from "@/components/ui-kit";
import { ArrowRight, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sales/$id/pay")({
  head: () => ({ meta: [{ title: "تسجيل دفعة فاتورة — 2A" }] }),
  component: InvoicePaymentPage,
});

type SaleFull = {
  id: string; invoice_no: number; total: number; discount: number; paid: number;
  created_at: string; notes: string | null; payment_method: string | null; account_name: string | null;
  customer_id: string | null;
  customers: { id: string; name: string; phone: string | null; balance: number } | null;
};

type Account = { id: string; name: string; type: "cash" | "bank" | "wallet" };

const methodMeta: Record<PaymentMethod, { icon: string; label: string }> = {
  cash: { icon: "💵", label: "نقدي" },
  bank: { icon: "🏦", label: "بنكي" },
  wallet: { icon: "📱", label: "محفظة" },
  transfer: { icon: "🔁", label: "تحويل" },
  credit: { icon: "📝", label: "آجل" },
};

const availableMethods: PaymentMethod[] = ["cash", "bank", "wallet"];

function InvoicePaymentPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const settings = useSettings();

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>(settings.defaultMethod);
  const [accountId, setAccountId] = useState(settings.paymentMethods[method]?.defaultAccountId || "");
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-pay", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id,invoice_no,total,discount,paid,created_at,notes,payment_method,account_name,customer_id, customers(id,name,phone,balance)")
        .eq("id", id).single();
      if (error) throw error;
      return data as unknown as SaleFull;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => { const { data, error } = await supabase.from("accounts").select("*").order("name"); if (error) throw error; return data as Account[]; },
  });

  const net = sale ? Number(sale.total) - Number(sale.discount) : 0;
  const tax = computeTax(net, settings);
  const grand = tax.grand;
  const due = sale ? Math.max(0, grand - Number(sale.paid)) : 0;

  const isDigital = method === "bank" || method === "wallet";
  const eligibleAccounts = useMemo(() => accounts.filter((a) => method === "cash" ? a.type === "cash" : (a.type === "bank" || a.type === "wallet")), [accounts, method]);
  const acc = accounts.find((a) => a.id === accountId);

  const save = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("الفاتورة غير موجودة");
      if (!(amount > 0)) throw new Error("أدخل مبلغاً صحيحاً");
      if (amount > due) throw new Error(`المبلغ يتجاوز المتبقي: ${formatSDG(due)}`);
      const cfg = settings.paymentMethods[method];
      if (cfg?.requireRef && isDigital && !txRef.trim()) throw new Error("رقم العملية مطلوب");
      const { data: userRes } = await supabase.auth.getUser(); const uid = userRes.user?.id;
      const finalNotes = [txRef.trim() ? `مرجع: ${txRef.trim()}` : "", notes.trim()].filter(Boolean).join(" · ") || null;
      const { error } = await supabase.from("payments").insert({
        direction: "in", amount, method, account_name: acc?.name ?? null,
        notes: finalNotes, created_by: uid ?? null,
        customer_id: sale.customer_id, sale_id: sale.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      qc.invalidateQueries();
      nav({ to: "/sales/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !sale) return <div className="p-6 text-center text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <Link to="/sales/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowRight className="w-4 h-4" />العودة للفاتورة
      </Link>
      <PageHeader title={`تسجيل دفعة — فاتورة #${sale.invoice_no}`} subtitle={sale.customers?.name ?? "نقدي"} />

      <div className="bg-card border rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">الإجمالي</div><div className="font-bold">{formatSDG(grand)}</div></div>
          <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">المدفوع</div><div className="font-bold">{formatSDG(Number(sale.paid))}</div></div>
          <div className="p-3 rounded-lg bg-muted/50"><div className="text-xs text-muted-foreground">المتبقي</div><div className="font-bold text-destructive">{formatSDG(due)}</div></div>
        </div>

        <Field label="المبلغ *">
          <Input type="number" step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
        </Field>
        <button onClick={() => setAmount(due)} className="text-xs text-primary hover:underline">تعيين المبلغ المتبقي</button>

        <Field label="طريقة الدفع">
          <div className="grid grid-cols-3 gap-2">
            {availableMethods.map((m) => (
              <button key={m} onClick={() => { setMethod(m); setAccountId(settings.paymentMethods[m]?.defaultAccountId || eligibleAccounts.find((a) => a.type === (m === "cash" ? "cash" : "bank" || "wallet"))?.id || ""); }}
                className={`h-10 rounded-lg border text-sm font-medium ${method === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {methodMeta[m].icon} {methodMeta[m].label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="الحساب">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background">
            {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>

        {isDigital && (
          <Field label="رقم العملية">
            <Input value={txRef} onChange={(e) => setTxRef(e.target.value)} dir="ltr" className="text-right font-mono" />
          </Field>
        )}

        <Field label="ملاحظات">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Link to="/sales/$id" params={{ id }} className="flex-1"><Btn variant="outline" className="w-full">إلغاء</Btn></Link>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || amount <= 0} className="flex-1">
            <Wallet className="w-4 h-4 inline ml-1" />حفظ الدفعة
          </Btn>
        </div>
      </div>
    </div>
  );
}
