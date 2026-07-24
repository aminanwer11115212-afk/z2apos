import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, useMyRole } from "@/lib/auth";
import { useSettings, encodeNotes, computeTax } from "@/lib/settings";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { Field, Btn, PageHeader, Modal, Input, useDialog } from "@/components/ui-kit";
import { Plus, Minus, Trash2, Search, Keyboard, UserPlus, Lock, Pause, Play } from "lucide-react";
import { toast } from "sonner";

type HeldSale = { id: string; savedAt: string; lines: Line[]; customerId: string; discount: number; paid: number; notes: string; paymentMethod: PaymentMethod };
const HOLD_KEY = "2a-held-sales";
const loadHeld = (): HeldSale[] => { try { return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]"); } catch { return []; } };
const saveHeld = (list: HeldSale[]) => localStorage.setItem(HOLD_KEY, JSON.stringify(list));

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
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [accountId, setAccountId] = useState(settings.defaultAccountId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const methodRef = useRef<HTMLButtonElement>(null);
  const custDialog = useDialog();
  const holdDialog = useDialog();
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [held, setHeld] = useState<HeldSale[]>(() => loadHeld());

  const hold = () => {
    if (lines.length === 0) { toast.error("لا توجد أصناف للتعليق"); return; }
    const entry: HeldSale = {
      id: crypto.randomUUID(), savedAt: new Date().toISOString(),
      lines, customerId, discount, paid, notes, paymentMethod,
    };
    const nx = [entry, ...held].slice(0, 20);
    setHeld(nx); saveHeld(nx);
    setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId("");
    toast.success("تم تعليق الفاتورة");
    searchRef.current?.focus();
  };
  const resume = (h: HeldSale) => {
    setLines(h.lines); setCustomerId(h.customerId); setDiscount(h.discount);
    setPaid(h.paid); setNotes(h.notes); setPaymentMethod(h.paymentMethod);
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
  useEffect(() => { setAccountId(settings.defaultAccountId); }, [settings.defaultAccountId]);

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

  const results = useMemo(() =>
    !q ? [] : parts.filter((p) => p.code.includes(q) || p.name.includes(q)).slice(0, 8),
    [q, parts]);

  useEffect(() => { setHi(0); }, [q]);

  const addPart = (p: Part) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.part.id === p.id);
      if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; }
      return [...prev, { part: p, qty: 1, unit_price: Number(p.sell_price) }];
    });
    setQ("");
    searchRef.current?.focus();
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

  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");
      const acc = settings.accounts.find((a) => a.id === accountId);
      const finalNotes = acc ? encodeNotes(acc.name, notes) : notes;
      const { data: sale, error: e1 } = await supabase.from("sales").insert({
        customer_id: customerId || null,
        discount: effectiveDiscount, paid, notes: finalNotes || null, created_by: uid,
        payment_method: paymentMethod,
        account_name: paymentMethod === "credit" ? null : (acc?.name ?? null),
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
      else if (e.key === "F6") { e.preventDefault(); accountRef.current?.focus(); }
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
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && results[hi]) { e.preventDefault(); addPart(results[hi]); }
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
          <div className="relative">
            <div className="flex items-center gap-2 h-11 px-3 rounded-xl border bg-card">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
                placeholder="ابحث بكود القطعة أو اسمها ثم Enter (F2)..."
                className="flex-1 bg-transparent outline-none text-sm" />
              {q && <button onClick={() => setQ("")} className="text-xs text-muted-foreground">✕</button>}
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 top-full mt-1 inset-x-0 bg-card border rounded-xl shadow-lg overflow-hidden">
                {results.map((p, i) => (
                  <button key={p.id} onMouseDown={(e) => { e.preventDefault(); addPart(p); }} type="button"
                    className={`w-full text-right px-3 py-2 flex items-center justify-between border-b last:border-0 ${i === hi ? "bg-muted" : "hover:bg-muted/60"}`}>
                    <div>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.code} · متوفر: {Number(p.quantity)}</div>
                    </div>
                    <div className="font-semibold text-primary text-sm">{formatSDG(p.sell_price)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">اضغط F2 وابحث عن قطعة للبدء</div>
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
            <div className="grid grid-cols-3 gap-1">
              {PAYMENT_METHODS.map((m, i) => (
                <button key={m.value} type="button" ref={i === 0 ? methodRef : undefined}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`h-9 rounded-lg border text-xs font-medium ${paymentMethod === m.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </Field>

          {paymentMethod !== "credit" && (
            <Field label="الحساب (F6)">
              <select ref={accountRef} value={accountId} onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-10 px-2 rounded-lg border bg-background text-sm">
                {settings.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.type === "cash" ? "💵" : "🏦"} {a.name}</option>
                ))}
              </select>
            </Field>
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
            <Btn variant="outline" onClick={() => { setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId(""); }} className="h-9 text-sm px-3">مسح</Btn>
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
