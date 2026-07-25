import { useState, useEffect, useRef } from "react";
import { PosPart } from "@/lib/pos";
import { formatSDG } from "@/lib/auth";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

const PAGE_SIZE = 24;

export function PosProductGrid({
  parts,
  q,
  onAdd,
}: {
  parts: PosPart[];
  q: string;
  onAdd: (p: PosPart) => void;
}) {
  const [page, setPage] = useState(1);
  const prevQ = useRef(q);

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

  useEffect(() => {
    if (prevQ.current !== q) { setPage(1); prevQ.current = q; }
  }, [q]);

  return (
    <div className="bg-card border rounded-xl p-2">
      {pageItems.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
            {pageItems.map((p) => {
              const oos = Number(p.quantity) <= 0;
              return (
                <button key={p.id} type="button" onClick={() => onAdd(p)} disabled={oos}
                  className={`text-right p-2 rounded-lg border bg-background hover:bg-muted transition-colors flex flex-col gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${oos ? "ring-1 ring-destructive/30" : ""}`}
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
  );
}
