import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { Field, Input, Btn, PageHeader } from "@/components/ui-kit";
import { Plus, Minus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sales/new")({
  head: () => ({ meta: [{ title: "بيع سريع — 2A" }] }),
  component: NewSale,
});

type Part = { id: string; code: string; name: string; sell_price: number; quantity: number };
type Line = { part: Part; qty: number; unit_price: number };

function NewSale() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select("id,code,name,sell_price,quantity").order("name");
      if (error) throw error;
      return data as Part[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const results = useMemo(() =>
    !q ? [] : parts.filter((p) => p.code.includes(q) || p.name.includes(q)).slice(0, 8),
    [q, parts]);

  const addPart = (p: Part) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.part.id === p.id);
      if (i >= 0) { const nx = [...prev]; nx[i] = { ...nx[i], qty: nx[i].qty + 1 }; return nx; }
      return [...prev, { part: p, qty: 1, unit_price: Number(p.sell_price) }];
    });
    setQ("");
  };
  const setQty = (id: string, qty: number) =>
    setLines((p) => p.map((l) => l.part.id === id ? { ...l, qty: Math.max(0.01, qty) } : l));
  const setPrice = (id: string, price: number) =>
    setLines((p) => p.map((l) => l.part.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  const remove = (id: string) => setLines((p) => p.filter((l) => l.part.id !== id));

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const due = Math.max(0, total - discount - paid);

  const save = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("لا توجد أصناف");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const { data: sale, error: e1 } = await supabase.from("sales").insert({
        customer_id: customerId || null,
        discount, paid, notes: notes || null, created_by: uid ?? null,
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
      nav({ to: "/sales" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader title="فاتورة بيع جديدة" />

      <div className="grid lg:grid-cols-[1fr,360px] gap-4">
        <div className="space-y-4">
          <div className="relative">
            <div className="flex items-center gap-2 h-12 px-3 rounded-xl border bg-card">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                placeholder="ابحث بكود القطعة أو اسمها لإضافتها..."
                className="flex-1 bg-transparent outline-none" />
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 top-full mt-1 inset-x-0 bg-card border rounded-xl shadow-lg overflow-hidden">
                {results.map((p) => (
                  <button key={p.id} onClick={() => addPart(p)} type="button"
                    className="w-full text-right px-4 py-3 hover:bg-muted flex items-center justify-between border-b last:border-0">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.code} · متوفر: {Number(p.quantity)}</div>
                    </div>
                    <div className="font-semibold text-primary">{formatSDG(p.sell_price)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-2xl overflow-hidden">
            {lines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">أضف قطعة للبدء</div>
            ) : (
              <div className="divide-y">
                {lines.map((l) => (
                  <div key={l.part.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.part.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{l.part.code}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(l.part.id, l.qty - 1)} className="w-8 h-8 rounded-lg border hover:bg-muted"><Minus className="w-4 h-4 mx-auto" /></button>
                      <input type="number" step="0.01" value={l.qty}
                        onChange={(e) => setQty(l.part.id, Number(e.target.value))}
                        className="w-14 h-8 text-center rounded-lg border bg-background" />
                      <button onClick={() => setQty(l.part.id, l.qty + 1)} className="w-8 h-8 rounded-lg border hover:bg-muted"><Plus className="w-4 h-4 mx-auto" /></button>
                    </div>
                    <input type="number" step="0.01" value={l.unit_price}
                      onChange={(e) => setPrice(l.part.id, Number(e.target.value))}
                      className="w-24 h-8 px-2 rounded-lg border bg-background text-sm" />
                    <div className="w-24 text-left font-semibold text-sm">{formatSDG(l.qty * l.unit_price)}</div>
                    <button onClick={() => remove(l.part.id)} className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="bg-card border rounded-2xl p-4 space-y-3 h-fit lg:sticky lg:top-20">
          <Field label="العميل (اختياري)">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background">
              <option value="">— بيع نقدي —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="خصم"><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></Field>
            <Field label="مدفوع"><Input type="number" step="0.01" value={paid} onChange={(e) => setPaid(Number(e.target.value) || 0)} /></Field>
          </div>
          <Field label="ملاحظات"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

          <div className="border-t pt-3 space-y-1 text-sm">
            <Row label="الإجمالي" value={formatSDG(total)} />
            <Row label="الخصم" value={`- ${formatSDG(discount)}`} />
            <Row label="المدفوع" value={`- ${formatSDG(paid)}`} />
            <div className="flex justify-between font-bold text-base pt-2 border-t">
              <span>المتبقي</span><span className={due > 0 ? "text-destructive" : "text-success"}>{formatSDG(due)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Btn variant="outline" onClick={() => { setLines([]); setDiscount(0); setPaid(0); setNotes(""); setCustomerId(""); }} className="flex-1">مسح</Btn>
            <Btn onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0} className="flex-1">
              حفظ الفاتورة
            </Btn>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span>{value}</span></div>;
}
