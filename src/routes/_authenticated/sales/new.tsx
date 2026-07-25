import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, useMyRole } from "@/lib/auth";
import { useSettings, encodeNotes, computeTax } from "@/lib/settings";
import { type PaymentMethod } from "@/lib/payments";
import { PosPart, PosLine, HeldSale, HOLD_KEY, loadHeld, saveHeld } from "@/lib/pos";
import { Field, Btn, PageHeader, Modal, Input, useDialog } from "@/components/ui-kit";
import { PosProductGrid } from "@/components/PosProductGrid";
import { PosCart } from "@/components/PosCart";
import { PosSidebar } from "@/components/PosSidebar";
import { Search, Keyboard, Pause, Play, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sales/new")({
  head: () => ({ meta: [{ title: "بيع سريع — 2A" }] }),
  component: NewSale,
});

function NewSale() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const settings = useSettings();
  const { data: myRole } = useMyRole();
  const isSeller = myRole === "seller";
  const perms = settings.sellerPerms;
  const canEditPrice = !isSeller || perms.editPrice;
  const maxDiscPct = isSeller ? perms.maxDiscountPercent : 100;

  const bankAccounts = useMemo(() => settings.accounts.filter((a) => a.type === "bank"), [settings.accounts]);
  const cashAccount = useMemo(() => settings.accounts.find((a) => a.type === "cash") ?? settings.accounts[0], [settings.accounts]);
  const enabledMethods = useMemo(
    () => (Object.keys(settings.paymentMethods) as ("cash" | "bank")[]).filter((k) => settings.paymentMethods[k].enabled),
    [settings.paymentMethods],
  );
  const initialMethod: PaymentMethod = enabledMethods.includes(settings.defaultMethod)
    ? settings.defaultMethod : (enabledMethods[0] ?? "cash");

  const [q, setQ] = useState("");
  const [lines, setLines] = useState<PosLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [bankAccountId, setBankAccountId] = useState<string>(
    settings.paymentMethods.bank.defaultAccountId || bankAccounts[0]?.id || ""
  );
  const [txRef, setTxRef] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [held, setHeld] = useState<HeldSale[]>(() => loadHeld());
  const [newCust, setNewCust] = useState({ name: "", phone: "" });

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const methodRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const custDialog = useDialog();
  const holdDialog = useDialog();

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select("id,code,name,sell_price,quantity").order("name");
      if (error) throw error;
      return data as PosPart[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lite-phone"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,phone").order("name");
      if (error) throw error;
      return data as { id: string; name: string; phone: string | null }[];
    },
  });

  const addCustomer = useMutation({
    mutationFn: async () => {
      if (!newCust.name.trim()) throw new Error("الاسم مطلوب");
      const { data, error } = await supabase.from("customers")
        .insert({ name: newCust.name.trim(), phone: newCust.phone.trim() || null })
        .select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("تمت إضافة العميل");
      setCustomerId(id);
      setNewCust({ name: "", phone: "" });
      custDialog.hide();
      qc.invalidateQueries({ queryKey: ["customers-lite-phone"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const availableFor = (partId: string) => {
    const p = parts.find((x) => x.id === partId);
    if (!p) return 0;
    const inCart = lines.find((l) => l.part.id === partId)?.qty ?? 0;
    return Math.max(0, Number(p.quantity) - inCart);
  };

  const addPart = (p: PosPart) => {
    if (Number(p.quantity) <= 0) { toast.error(`الصنف ${p.name} غير متوفر في المخزون`); return; }
    if (availableFor(p.id) < 1) { toast.error(`لا يوجد رصيد كافٍ من ${p.name} — المتاح: ${Number(p.quantity)}`); return; }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.part.id === p.id);
      if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; }
      return [...prev, { part: p, qty: 1, unit_price: Number(p.sell_price) }];
    });
  };

  const setQty = (id: string, qty: number) => {
    const part = parts.find((x) => x.id === id);
    const max = part ? Number(part.quantity) : Infinity;
    const target = Math.max(0.01, Math.min(qty, max));
    setLines((p) => p.map((l) => l.part.id === id ? { ...l, qty: target } : l));
  };

  const setPrice = (id: string, price: number) =>
    setLines((p) => p.map((l) => l.part.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  const remove = (id: string) => setLines((p) => p.filter((l) => l.part.id !== id));

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const maxDiscount = total * (maxDiscPct / 100);
  const effectiveDiscount = Math.min(discount, maxDiscount);
  const net = Math.max(0, total - effectiveDiscount);
  const tax = computeTax(net, settings);
  const due = Math.max(0, tax.grand - paid);

  const payFull = () => setPaid(tax.grand);

  const hold = () => {
    if (lines.length === 0) { toast.error("لا توجد أصناف للتعليق"); return; }
    const entry: HeldSale = {
      id: crypto.randomUUID(), savedAt: new Date().toISOString(),
      lines, customerId, discount, paid, notes, paymentMethod, bankAccountId, txRef,
    };
    const nx = [entry, ...held].slice(0, 20);
    setHeld(nx); saveHeld(nx);
    setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId(""); setTxRef("");
    toast.success("تم تعليق الفاتورة");
    searchRef.current?.focus();
  };
  const resume = (h: HeldSale) => {
    setLines(h.lines); setCustomerId(h.customerId); setDiscount(h.discount);
    setPaid(h.paid); setNotes(h.notes); setPaymentMethod(h.paymentMethod);
    if (h.bankAccountId) setBankAccountId(h.bankAccountId);
    setTxRef(h.txRef ?? "");
    const nx = held.filter((x) => x.id !== h.id);
    setHeld(nx); saveHeld(nx);
    holdDialog.hide();
    toast.success("تم استعادة الفاتورة");
  };
  const dropHeld = (id: string) => {
    const nx = held.filter((x) => x.id !== id);
    setHeld(nx); saveHeld(nx);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
      for (const l of lines) {
        const avail = Number(l.part.quantity);
        if (l.qty > avail) throw new Error(`الكمية المطلوبة من ${l.part.name} (${l.qty}) تتجاوز المتاح (${avail})`);
      }
      const methodCfg = settings.paymentMethods[paymentMethod as "cash" | "bank"];
      if (methodCfg?.requireRef && !txRef.trim()) throw new Error("رقم العملية مطلوب لهذه الطريقة");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");
      const acc = paymentMethod === "bank"
        ? bankAccounts.find((a) => a.id === bankAccountId)
        : cashAccount;
      const ref = paymentMethod === "bank" ? txRef.trim() : "";
      const finalNotes = acc ? encodeNotes(acc.name, notes, ref) : notes;
      const { data: sale, error: e1 } = await supabase.from("sales").insert({
        customer_id: customerId || null,
        discount: effectiveDiscount, paid, notes: finalNotes || null