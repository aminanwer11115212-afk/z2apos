import { useState } from "react";
import { Modal, Field, Input, Btn } from "@/components/ui-kit";
import {
  BULK_OPS,
  ROUND_MODES,
  PRICE_LABEL,
  computeBulkPrice,
  type BulkOp,
  type PriceField,
  type RoundMode,
} from "@/lib/parts";
import { formatSDG } from "@/lib/auth";
import { Wand2 } from "lucide-react";

const TARGETS: PriceField[] = ["sell_price", "wholesale_price", "cost_price"];

export type BulkTargetRow = {
  key: string;
  name: string;
  cost_price: number;
  sell_price: number;
  wholesale_price: number;
};

export type BulkResult = { key: string; field: PriceField; value: number };

/**
 * Bulk price editor. It never touches the database: it returns the computed
 * values so the caller can drop them into the grid, where the user reviews the
 * highlighted changes and saves (or discards) them.
 */
export function BulkPriceDialog({
  open,
  onClose,
  rows,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  rows: BulkTargetRow[];
  onApply: (results: BulkResult[]) => void;
}) {
  const [targets, setTargets] = useState<PriceField[]>(["sell_price"]);
  const [op, setOp] = useState<BulkOp>("increase_percent");
  const [value, setValue] = useState("10");
  const [source, setSource] = useState<PriceField>("cost_price");
  const [round, setRound] = useState<RoundMode>("none");

  const toggleTarget = (f: PriceField) =>
    setTargets((t) => (t.includes(f) ? t.filter((x) => x !== f) : [...t, f]));

  const input = { op, value: Number(value) || 0, source, round };
  const results: BulkResult[] = rows.flatMap((r) =>
    targets.map((f) => ({ key: r.key, field: f, value: computeBulkPrice(r, f, input) })),
  );
  const preview = rows.slice(0, 5);

  const apply = () => {
    onApply(results);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`تعديل الأسعار الجماعي — ${rows.length} صنف`}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={apply} disabled={rows.length === 0 || targets.length === 0}>
            <Wand2 className="w-4 h-4 inline ml-1" />
            تطبيق على {rows.length} صنف
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="الأسعار المستهدفة">
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleTarget(f)}
                className={`h-10 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  targets.includes(f)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {PRICE_LABEL[f]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="العملية">
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as BulkOp)}
              className="w-full h-11 px-3 rounded-lg border bg-background"
            >
              {BULK_OPS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={op.includes("percent") || op.includes("margin") ? "النسبة %" : "القيمة"}>
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {op === "copy_from" && (
            <Field label="النسخ من">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as PriceField)}
                className="w-full h-11 px-3 rounded-lg border bg-background"
              >
                {TARGETS.map((f) => (
                  <option key={f} value={f}>
                    {PRICE_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="التقريب">
            <select
              value={round}
              onChange={(e) => setRound(e.target.value as RoundMode)}
              className="w-full h-11 px-3 rounded-lg border bg-background"
            >
              {ROUND_MODES.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يتم تحديد أي صنف. حدّد صفوفاً من الجدول أولاً.
          </p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              معاينة (أول {preview.length} من {rows.length})
            </div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-right p-2 font-medium">الصنف</th>
                  {targets.map((f) => (
                    <th key={f} className="text-center p-2 font-medium">
                      {PRICE_LABEL[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2 truncate max-w-40">{r.name || "—"}</td>
                    {targets.map((f) => {
                      const next = computeBulkPrice(r, f, input);
                      return (
                        <td key={f} className="p-2 text-center whitespace-nowrap">
                          <span className="text-muted-foreground line-through">
                            {formatSDG(Number(r[f]))}
                          </span>{" "}
                          <span className="font-semibold">{formatSDG(next)}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          التعديل يظهر في الجدول بلون التغيير ولا يُحفظ في قاعدة البيانات إلا بعد الضغط على «حفظ».
        </p>
      </div>
    </Modal>
  );
}
