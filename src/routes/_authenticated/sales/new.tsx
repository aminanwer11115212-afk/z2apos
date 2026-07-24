import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, useMyRole } from "@/lib/auth";
import { useSettings, encodeNotes, computeTax } from "@/lib/settings";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
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

  const addPart = (p: Part) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.part.id === p.id);
      if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; }
      return [...prev, { part: p, qty: 1, unit_price: Number(p.sell_price) }];
    });
  };
  const setQty = (id: string, qty: number) =>
    setLines((p) => p.map((l) => l.part.id === id ? { ...l, qty: Math.max(0.01, qty) } : l));
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

  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
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
        discount: effectiveDiscount, paid, notes: finalNotes || null, created_by: uid,
        payment_method: paymentMethod,
        account_name: acc?.name ?? null,
      }).select("id, invoice_no").single();
      if (e1) throw e1;
      const items = lines.map((l) => ({ sale_id: sale.id, part_id: l.part.id, qty: l.qty, unit_price: l.unit_price }));
      const { error: e2 } = await supabase.from("sale_items").insert(items);
      if (e2) throw e2;
      return sale;
    },
    onSuccess: (sale) => {
      toast.success(`تم حفظ الفاتورة #${sale.invoice_no}`);
      qc.invalidateQueries();
      nav({ to: "/sales/$id", params: { id: sale.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if (e.key === "F2" || (e.key === "/" && !inField)) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "F4") { e.preventDefault(); customerRef.current?.focus(); }
      else if (e.key === "F7") { e.preventDefault(); methodRef.current?.focus(); }
      else if (e.key === "F9") { e.preventDefault(); if (lines.length && !save.isPending) save.mutate(); }
      else if (e.key === "F8") { e.preventDefault(); hold(); }
      else if (!inField && (e.key === "+" || e.key === "=")) {
        const last = lines[lines.length - 1]; if (last) { e.preventDefault(); setQty(last.part.id, last.qty + 1); }
      } else if (!inField && (e.key === "-" || e.key === "_")) {
        const last = lines[lines.length - 1]; if (last) { e.preventDefault(); setQty(last.part.id, Math.max(0.01, last.qty - 1)); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines, save]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && pageItems[0]) { e.preventDefault(); addPart(pageItems[0]); }
    else if (e.key === "Escape") { setQ(""); }
  };

  return (
    <div className="p-3 lg:p-4 max-w-6xl mx-auto">
      <PageHeader title="بيع سريع" actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => holdDialog.show()}
            className="relative h-8 px-2.5 rounded-lg border text-xs font-medium hover:bg-muted flex items-center gap-1">
            <Play className="w-3.5 h-3.5" />المعلّقة
            {held.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{held.length}</span>}
          </button>
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <Keyboard className="w-3.5 h-3.5" />
            <span>F2 بحث · F8 تعليق · F9 حفظ · +/-</span>
          </div>
        </div>
      } />

      <div className="grid lg:grid-cols-[1fr,320px] gap-3">
        <div className="space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2 h-11 px-3 rounded-xl border bg-card">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
              placeholder="ابحث بكود القطعة أو اسمها (F2)..."
              className="flex-1 bg-transparent outline-none text-sm" />
            {q && <button onClick={() => setQ("")} className="text-xs text-muted-foreground">✕</button>}
            <span className="text-xs text-muted-foreground shrink-0">{filtered.length} صنف</span>
          </div>

          {/* Products grid with pagination */}
          <div className="bg-card border rounded-xl p-2">
            {pageItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                  {pageItems.map((p) => {
                    const oos = Number(p.quantity) <= 0;
                    return (
                      <button key={p.id} type="button" onClick={() => addPart(p)}
                        className={`text-right p-2 rounded-lg border bg-background hover:bg-muted transition-colors flex flex-col gap-1 ${oos ? "opacity-60" : ""}`}
                        title={oos ? "غير متوفر" : "إضافة"}>
                        <div className="text-sm font-medium line-clamp-2 min-h-10 leading-tight">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.code}</div>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] ${oos ? "text-destructive" : "text-muted-foreground"}`}>متوفر: {Number(p.quantity)}</span>
                          <span className="text-sm font-semibold text-primary">{formatSDG(p.sell_price)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-2 border-t text-xs">
                    <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={pageSafe === 1}
                      className="h-8 px-3 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                      <ChevronRight className="w-3.5 h-3.5" />السابق
                    </button>
                    <span className="text-muted-foreground">صفحة {pageSafe} من {pageCount}</span>
                    <button onClick={() => setPage((n) => Math.min(pageCount, n + 1))} disabled={pageSafe === pageCount}
                      className="h-8 px-3 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                      التالي<ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart lines */}
          <div className="bg-card border rounded-xl overflow-hidden">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">اختر منتجاً من الأعلى للبدء</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-right p-2 font-medium">الصنف</th>
                    <th className="text-center p-2 font-medium w-28">الكمية</th>
                    <th className="text-center p-2 font-medium w-24">السعر</th>
                    <th className="text-left p-2 font-medium w-24">الإجمالي</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.part.id}>
                      <td className="p-2">
                        <div className="font-medium truncate">{l.part.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{l.part.code}</div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setQty(l.part.id, l.qty - 1)} className="w-7 h-7 rounded border hover:bg-muted"><Minus className="w-3 h-3 mx-auto" /></button>
                          <input type="number" step="0.01" value={l.qty}
                            onChange={(e) => setQty(l.part.id, Number(e.target.value))}
                            className="w-14 h-7 text-center rounded border bg-background text-sm" />
                          <button onClick={() => setQty(l.part.id, l.qty + 1)} className="w-7 h-7 rounded border hover:bg-muted"><Plus className="w-3 h-3 mx-auto" /></button>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="relative">
                          <input type="number" step="0.01" value={l.unit_price} readOnly={!canEditPrice}
                            onChange={(e) => canEditPrice && setPrice(l.part.id, Number(e.target.value))}
                            className={`w-full h-7 px-2 rounded border bg-background text-sm text-center ${!canEditPrice ? "opacity-70 cursor-not-allowed" : ""}`} />
                          {!canEditPrice && <Lock className="w-3 h-3 absolute left-1 top-2 text-muted-foreground" />}
                        </div>
                      </td>
                      <td className="p-2 text-left font-semibold">{formatSDG(l.qty * l.unit_price)}</td>
                      <td className="p-2">
                        <button onClick={() => remove(l.part.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="bg-card border rounded-xl p-3 space-y-2 h-fit lg:sticky lg:top-16 text-sm">
          <Field label="العميل (F4)">
            <div className="flex gap-1">
              <select ref={customerRef} value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                className="flex-1 h-10 px-2 rounded-lg border bg-background text-sm">
                <option value="">— بيع نقدي —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
                ))}
              </select>
              <button type="button" onClick={() => custDialog.show()}
                title="عميل جديد سريع"
                className="w-10 h-10 rounded-lg border hover:bg-muted flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          </Field>

          <Field label="طريقة الدفع (F7)">
            <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${Math.max(1, enabledMethods.length)}, minmax(0, 1fr))` }}>
              {enabledMethods.map((m, i) => {
                const meta = m === "cash" ? { icon: "💵", label: "نقدي" } : { icon: "🏦", label: "بنكي" };
                return (
                  <button key={m} type="button" ref={i === 0 ? methodRef : undefined}
                    onClick={() => setPaymentMethod(m)}
                    className={`h-10 rounded-lg border text-sm font-medium ${paymentMethod === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                    {meta.icon} {meta.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {paymentMethod === "bank" && (
            <>
              <Field label="الحساب البنكي">
                <div className="grid grid-cols-3 gap-1">
                  {bankAccounts.map((a) => (
                    <button key={a.id} type="button" onClick={() => setBankAccountId(a.id)}
                      className={`h-9 rounded-lg border text-xs font-medium ${bankAccountId === a.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="رقم العملية">
                <input value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="اختياري"
                  className="w-full h-10 px-2 rounded-lg border bg-background text-sm font-mono" dir="ltr" />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label={`خصم${isSeller && maxDiscPct < 100 ? ` (حد ${maxDiscPct}%)` : ""}`}>
              <input type="number" step="0.01" value={discount}
                onChange={(e) => setDiscount(Math.min(Number(e.target.value) || 0, maxDiscount))}
                className="w-full h-10 px-2 rounded-lg border bg-background text-sm" />
            </Field>
            <Field label="مدفوع">
              <input type="number" step="0.01" value={paid} onChange={(e) => setPaid(Number(e.target.value) || 0)}
                className="w-full h-10 px-2 rounded-lg border bg-background text-sm" />
            </Field>
          </div>

          <button type="button" onClick={payFull} disabled={tax.grand <= 0}
            className="w-full h-9 rounded-lg border border-success/40 bg-success/10 text-success text-xs font-medium hover:bg-success/20 disabled:opacity-40 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />دفع كامل ({formatSDG(tax.grand)})
          </button>

          <Field label="ملاحظات">
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 px-2 rounded-lg border bg-background text-sm" />
          </Field>

          <div className="border-t pt-2 space-y-1 text-xs">
            <Row label="الإجمالي" value={formatSDG(total)} />
            <Row label="الخصم" value={`- ${formatSDG(effectiveDiscount)}`} />
            {settings.taxEnabled && settings.taxPercent > 0 && (
              <Row label={`الضريبة (${settings.taxPercent}%)`} value={`+ ${formatSDG(tax.amount)}`} />
            )}
            <Row label="المدفوع" value={`- ${formatSDG(paid)}`} />
            <div className="flex justify-between font-bold text-sm pt-1 border-t">
              <span>المتبقي</span><span className={due > 0 ? "text-destructive" : "text-success"}>{formatSDG(due)}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Btn variant="outline" onClick={() => { setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId(""); setTxRef(""); }} className="h-9 text-sm px-3">مسح</Btn>
            <Btn variant="outline" onClick={hold} disabled={lines.length === 0} className="h-9 text-sm px-3" title="F8">
              <Pause className="w-3.5 h-3.5 inline ml-1" />تعليق
            </Btn>
            <Btn onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0} className="flex-1 h-9 text-sm">
              حفظ (F9)
            </Btn>
          </div>
        </aside>
      </div>

      <Modal open={holdDialog.open} onClose={holdDialog.hide} title={`فواتير معلّقة (${held.length})`}>
        {held.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد فواتير معلّقة</p>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {held.map((h) => {
              const t = h.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
              return (
                <li key={h.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{h.lines.length} صنف · {formatSDG(t)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.savedAt).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Btn onClick={() => resume(h)} className="h-8 text-xs px-3">استعادة</Btn>
                    <button onClick={() => dropHeld(h.id)} className="w-8 h-8 rounded border text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal open={custDialog.open} onClose={custDialog.hide} title="عميل جديد"
        footer={<>
          <Btn variant="outline" onClick={custDialog.hide}>إلغاء</Btn>
          <Btn onClick={() => addCustomer.mutate()} disabled={addCustomer.isPending || !newCust.name.trim()}>حفظ</Btn>
        </>}>
        <div className="space-y-3">
          <Field label="الاسم *"><Input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} autoFocus /></Field>
          <Field label="الهاتف"><Input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} dir="ltr" className="text-right" /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span>{value}</span></div>;
}
