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
