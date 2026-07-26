import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/auth";
import { useSettings, encodeNotes, computeTax } from "@/lib/settings";
import { type PaymentMethod } from "@/lib/payments";
import { PosPart, PosLine, HeldSale, loadHeld, saveHeld } from "@/lib/pos";
import { usePosCustomerDialog } from "@/components/PosCustomerDialog";
import { usePosHeld } from "./usePosHeld";
import { toast } from "sonner";

export function usePos() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const settings = useSettings();
  const { data: myRole } = useMyRole();
  const isSeller = myRole === "seller";
  const perms = settings.sellerPerms;
  const canEditPrice = !isSeller || perms.editPrice;
  const maxDiscPct = isSeller ? perms.maxDiscountPercent : 100;

  const digitalAccounts = useMemo(() => settings.accounts.filter((a) => a.type === "bank" || a.type === "wallet"), [settings.accounts]);
  const cashAccount = useMemo(() => settings.accounts.find((a) => a.type === "cash") ?? settings.accounts[0], [settings.accounts]);
  const enabledMethods = useMemo(() => (Object.keys(settings.paymentMethods) as PaymentMethod[]).filter((k) => settings.paymentMethods[k]?.enabled), [settings.paymentMethods]);
  const initialMethod: PaymentMethod = enabledMethods.includes(settings.defaultMethod) ? settings.defaultMethod : (enabledMethods[0] ?? "cash");

  const [q, setQ] = useState("");
  const [lines, setLines] = useState<PosLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [bankAccountId, setBankAccountId] = useState(settings.paymentMethods[paymentMethod]?.defaultAccountId || digitalAccounts[0]?.id || "");
  const [txRef, setTxRef] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const methodRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const custDialog = usePosCustomerDialog((id) => setCustomerId(id));
  const held = usePosHeld({ lines, setLines, setCustomerId, setDiscount, setPaid, setNotes, setPaymentMethod, setBankAccountId, setTxRef, searchRef });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-lite"],
    queryFn: async () => { const { data, error } = await supabase.from("parts").select("id,code,name,sell_price,quantity,category").order("name"); if (error) throw error; return data as PosPart[]; },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lite-phone"],
    queryFn: async () => { const { data, error } = await supabase.from("customers").select("id,name,phone").order("name"); if (error) throw error; return data as { id: string; name: string; phone: string | null }[]; },
  });

  const addPart = (p: PosPart) => {
    const available = Math.max(0, Number(p.quantity) - (lines.find((l) => l.part.id === p.id)?.qty ?? 0));
    if (available < 1) { toast.error(`لا يوجد رصيد كافٍ من ${p.name}`); return; }
    setLines((prev) => { const i = prev.findIndex((l) => l.part.id === p.id); if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; } return [...prev, { part: p, qty: 1, unit_price: Number(p.sell_price) }]; });
  };
  const setQty = (id: string, qty: number) => { const max = Number(parts.find((x) => x.id === id)?.quantity ?? Infinity); setLines((p) => p.map((l) => l.part.id === id ? { ...l, qty: Math.max(0.01, Math.min(qty, max)) } : l)); };
  const setPrice = (id: string, price: number) => setLines((p) => p.map((l) => l.part.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  const remove = (id: string) => setLines((p) => p.filter((l) => l.part.id !== id));

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const maxDiscount = total * (maxDiscPct / 100);
  const effectiveDiscount = Math.min(discount, maxDiscount);
  const net = Math.max(0, total - effectiveDiscount);
  const tax = computeTax(net, settings);
  const due = Math.max(0, tax.grand - paid);
  const payFull = () => setPaid(tax.grand);
  const clear = () => { setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId(""); setTxRef(""); };
  const isDigital = paymentMethod === "bank" || paymentMethod === "wallet";

  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
      for (const l of lines) { const avail = Number(l.part.quantity); if (l.qty > avail) throw new Error(`الكمية المطلوبة من ${l.part.name} (${l.qty}) تتجاوز المتاح (${avail})`); }
      const cfg = settings.paymentMethods[paymentMethod as "cash" | "bank" | "wallet"]; if (cfg?.requireRef && isDigital && !txRef.trim()) throw new Error("رقم العملية مطلوب");
      const { data: userRes } = await supabase.auth.getUser(); const uid = userRes.user?.id; if (!uid) throw new Error("يجب تسجيل الدخول");
      const acc = isDigital ? digitalAccounts.find((a) => a.id === bankAccountId) : cashAccount;
      const ref = isDigital ? txRef.trim() : "";
      const finalNotes = acc ? encodeNotes(acc.name, notes, ref) : notes;
      const { data: sale, error: e1 } = await supabase.from("sales").insert({ customer_id: customerId || null, discount: effectiveDiscount, paid, notes: finalNotes || null, created_by: uid, payment_method: paymentMethod, account_name: acc?.name ?? null }).select("id, invoice_no").single(); if (e1) throw e1;
      const items = lines.map((l) => ({ sale_id: sale.id, part_id: l.part.id, qty: l.qty, unit_price: l.unit_price })); const { error: e2 } = await supabase.from("sale_items").insert(items); if (e2) throw e2;
      return sale;
    },
    onSuccess: (sale) => { toast.success(`تم حفظ الفاتورة #${sale.invoice_no}`); qc.invalidateQueries(); nav({ to: "/sales/$id", params: { id: sale.id }, search: settings.autoPrintAfterSale ? { print: 1 } : {} }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (e.key === "F2" || (e.key === "/" && !inField)) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "F4") { e.preventDefault(); customerRef.current?.focus(); }
      else if (e.key === "F6") { e.preventDefault(); if (!isDigital) setPaymentMethod("bank"); setTimeout(() => accountRef.current?.focus(), 0); }
      else if (e.key === "F7") { e.preventDefault(); methodRef.current?.focus(); }
      else if (e.key === "F9") { e.preventDefault(); if (lines.length && !save.isPending) save.mutate(); }
      else if (e.key === "F8") { e.preventDefault(); held.hold(); }
      else if (!inField && (e.key === "+" || e.key === "=")) { const last = lines[lines.length - 1]; if (last) { e.preventDefault(); setQty(last.part.id, last.qty + 1); } }
      else if (!inField && (e.key === "-" || e.key === "_")) { const last = lines[lines.length - 1]; if (last) { e.preventDefault(); setQty(last.part.id, Math.max(0.01, last.qty - 1)); } }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [lines, save, paymentMethod, isDigital, held.hold]);

  // Enter (لوحة مفاتيح أو قارئ باركود): تطابق تام مع الكود يضيف الصنف فوراً،
  // ونتيجة وحيدة للبحث تُضاف أيضاً — ثم يُفرَّغ الحقل جاهزاً للمسح التالي.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setQ(""); return; }
    if (e.key !== "Enter") return;
    const s = q.trim();
    if (!s) return;
    e.preventDefault();
    const exact = parts.find((p) => p.code === s);
    const matches = exact ? [exact] : parts.filter((p) => p.code.includes(s) || p.name.includes(s));
    if (matches.length === 1) { addPart(matches[0]); setQ(""); }
    else if (matches.length === 0) toast.error(`لا يوجد صنف بالكود «${s}»`);
  };

  return {
    q, setQ, searchRef, onSearchKey,
    parts, customers,
    lines, canEditPrice, setQty, setPrice, remove, addPart,
    customerId, setCustomerId, customerRef,
    paymentMethod, setPaymentMethod, methodRef,
    bankAccountId, setBankAccountId, accountRef,
    txRef, setTxRef,
    discount, setDiscount,
    paid, setPaid,
    notes, setNotes,
    total, settings, isSeller, accounts: settings.accounts,
    payFull, clear, save,
    ...held,
    custDialog,
  };
}
