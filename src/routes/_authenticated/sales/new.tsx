import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, useMyRole } from "@/lib/auth";
import { useSettings, encodeNotes, computeTax } from "@/lib/settings";
import { type PaymentMethod } from "@/lib/payments";
import { Field, Btn, PageHeader, Modal, Input, useDialog } from "@/components/ui-kit";
import { Plus, Minus, Trash2, Search, Keyboard, UserPlus, Lock, Pause, Play, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type HeldSale = { id: string; savedAt: string; lines: Line[]; customerId: string; discount: number; paid: number; notes: string; paymentMethod: PaymentMethod; bankAccountId?: string; txRef?: string };
const HOLD_KEY = "2a-held-sales";
const loadHeld = (): HeldSale[] => { try { return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]"); } catch { return []; } };
const saveHeld = (list: HeldSale[]) => localStorage.setItem(HOLD_KEY, JSON.stringify(list));

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_authenticated/sales/new")({
  head: () => ({ meta: [{ title: "بيع سريع — 2A" }] }),
  component: NewSale,
});

type Part = { id: string; code: string; name: string; sell_price: number; quantity: number };
type Line = { part: Part; qty: number; unit_price: number };

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
  const [page, setPage] = useState(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [bankAccountId, setBankAccountId] = useState<string>(
    settings.paymentMethods.bank.defaultAccountId || bankAccounts[0]?.id || ""
  );
  const [txRef, setTxRef] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const methodRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const custDialog = useDialog();
  const holdDialog = useDialog();
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [held, setHeld] = useState<HeldSale[]>(() => loadHeld());

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

  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select("id,code,name,sell_price,quantity").order("name");
      if (error) throw error;
      return data as Part[];
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

  const filtered = useMemo(() => {
    if (!q.trim()) return parts;
    const s = q.trim();
    return parts.filter((p) => p.code.includes(s) || p.name.includes(s));
  }, [q, parts]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe]
  );

  useEffect(() => { setPage(1); }, [q]);

  const availableFor = (partId: string) => {
    const p = parts.find((x) => x.id === partId);
    if (!p) return 0;
    const inCart = lines.find((l) => l.part.id === partId)?.qty ?? 0;
    return Math.max(0, Number(p.quantity) - inCart);
  };

  const addPart = (p: Part) => {
    if (Number(p.quantity) <= 0) { toast.error(`الصنف ${p.name} غير متوفر في المخزون`); return