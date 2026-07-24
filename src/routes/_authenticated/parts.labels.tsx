import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Barcode from "react-barcode";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { Btn, PageHeader, SearchBar } from "@/components/ui-kit";
import { Printer, ArrowRight, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parts/labels")({
  head: () => ({ meta: [{ title: "طباعة باركود — 2A" }] }),
  component: LabelsPage,
});

type Part = { id: string; code: string; name: string; sell_price: number };

function LabelsPage() {
  const settings = useSettings();
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-labels"],
    queryFn: async () => {
      const { data } = await supabase.from("parts").select("id,code,name,sell_price").order("name");
      return (data ?? []) as Part[];
    },
  });

  const filtered = useMemo(() =>
    parts.filter((p) => !q || p.code.includes(q) || p.name.includes(q)).slice(0, 50),
    [parts, q]);

  const set = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, n) }));

  const labels = useMemo(() => {
    const out: Part[] = [];
    for (const p of parts) {
      const n = counts[p.id] ?? 0;
      for (let i = 0; i < n; i++) out.push(p);
    }
    return out;
  }, [parts, counts]);

  const total = labels.length;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="no-print">
        <PageHeader title="طباعة ملصقات باركود" subtitle={`${total} ملصق`}
          actions={<Btn onClick={() => window.print()} disabled={total === 0}>
            <Printer className="w-4 h-4 inline ml-1" />طباعة
          </Btn>} />
        <Link to="/parts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
          <ArrowRight className="w-4 h-4" />العودة للقطع
        </Link>

        <div className="bg-card border rounded-2xl p-4 mb-4 space-y-3">
          <SearchBar value={q} onChange={setQ} placeholder="بحث بالكود أو الاسم..." />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />إظهار الاسم</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />إظهار السعر</label>
            <Btn variant="outline" onClick={() => setCounts({})}>تفريغ</Btn>
          </div>

          <div className="max-h-72 overflow-auto border rounded-lg divide-y">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">لا توجد نتائج</div>
            ) : filtered.map((p) => {
              const n = counts[p.id] ?? 0;
              return (
                <div key={p.id} className="flex items-center gap-3 p-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.code} · {formatSDG(p.sell_price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => set(p.id, n - 1)} className="w-8 h-8 rounded border hover:bg-muted"><Minus className="w-3 h-3 mx-auto" /></button>
                    <input type="number" value={n} onChange={(e) => set(p.id, Number(e.target.value) || 0)}
                      className="w-14 h-8 text-center rounded border bg-background text-sm" />
                    <button onClick={() => set(p.id, n + 1)} className="w-8 h-8 rounded border hover:bg-muted"><Plus className="w-3 h-3 mx-auto" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="print-area labels-sheet">
        {labels.map((p, i) => (
          <div key={i} className="label">
            {showName && <div className="label-name">{p.name}</div>}
            <Barcode value={p.code} height={40} width={1.4} fontSize={12} margin={2} displayValue={true} />
            {showPrice && <div className="label-price">{formatSDG(p.sell_price)} · {settings.storeName}</div>}
          </div>
        ))}
        {total === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground text-sm no-print">
            اختر عدد الملصقات لكل قطعة من الأعلى ثم اضغط طباعة
          </div>
        )}
      </div>
    </div>
  );
}
