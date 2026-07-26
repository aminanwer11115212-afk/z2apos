import { PosLine, PosPart } from "@/lib/pos";
import { formatSDG } from "@/lib/auth";
import { Plus, Minus, Trash2, Lock } from "lucide-react";

type PosCartProps = {
  lines: PosLine[];
  parts: PosPart[];
  canEditPrice: boolean;
  onQty: (id: string, qty: number) => void;
  onPrice: (id: string, price: number) => void;
  onRemove: (id: string) => void;
};

export function PosCart({ lines, parts, canEditPrice, onQty, onPrice, onRemove }: PosCartProps) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {lines.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">اختر منتجاً من الأعلى للبدء</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-105">
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
            {lines.map((l) => {
              const max = parts.find((p) => p.id === l.part.id)?.quantity ?? Infinity;
              return (
                <tr key={l.part.id}>
                  <td className="p-2">
                    <div className="font-medium truncate">{l.part.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{l.part.code}</div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onQty(l.part.id, l.qty - 1)} className="w-7 h-7 rounded border hover:bg-muted"><Minus className="w-3 h-3 mx-auto" /></button>
                      <input type="number" step="0.01" value={l.qty}
                        onChange={(e) => onQty(l.part.id, Number(e.target.value))}
                        className="w-14 h-7 text-center rounded border bg-background text-sm" />
                      <button onClick={() => onQty(l.part.id, l.qty + 1)} className="w-7 h-7 rounded border hover:bg-muted"><Plus className="w-3 h-3 mx-auto" /></button>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="relative">
                      <input type="number" step="0.01" value={l.unit_price} readOnly={!canEditPrice}
                        onChange={(e) => canEditPrice && onPrice(l.part.id, Number(e.target.value))}
                        className={`w-full h-7 px-2 rounded border bg-background text-sm text-center ${!canEditPrice ? "opacity-70 cursor-not-allowed" : ""}`} />
                      {!canEditPrice && <Lock className="w-3 h-3 absolute left-1 top-2 text-muted-foreground" />}
                    </div>
                  </td>
                  <td className="p-2 text-left font-semibold">{formatSDG(l.qty * l.unit_price)}</td>
                  <td className="p-2">
                    <button onClick={() => onRemove(l.part.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
