import { memo } from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";

export type GridColKey =
  | "name"
  | "car_model"
  | "category"
  | "cost_price"
  | "sell_price"
  | "wholesale_price"
  | "quantity"
  | "min_quantity";

export type GridCol = {
  key: GridColKey;
  label: string;
  type: "text" | "num";
  width: string;
  placeholder?: string;
};

export type GridValues = Record<GridColKey, string>;

export type GridRow = {
  key: string;
  /** null for rows that do not exist in the database yet. */
  id: string | null;
  code: string;
  values: GridValues;
  /** Values as loaded from the database — null for new rows. */
  base: GridValues | null;
  removed: boolean;
};

export function isDirtyRow(r: GridRow): boolean {
  if (r.removed) return true;
  if (!r.base) return Object.values(r.values).some((v) => v.trim() !== "");
  return (Object.keys(r.values) as GridColKey[]).some((k) => r.values[k] !== r.base![k]);
}

export function isDirtyCell(r: GridRow, k: GridColKey): boolean {
  if (!r.base) return r.values[k].trim() !== "";
  return r.values[k] !== r.base[k];
}

type Props = {
  cols: GridCol[];
  rows: GridRow[];
  /** Index of the first visible row inside the full filtered list — for the # column. */
  offset: number;
  showCode: boolean;
  selected: Set<string>;
  errors: Map<string, string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onChange: (key: string, col: GridColKey, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => void;
  onFocusCell: (r: number, c: number) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  canDelete: boolean;
};

/**
 * Spreadsheet-style editor for parts.
 *
 * Every cell is a plain text input tagged with `data-cell="row-col"`; the owner
 * page drives focus off those coordinates, which keeps arrow/Tab/Enter movement
 * in one place and survives paging without a ref map per cell.
 */
export function PartsGrid(props: Props) {
  const { cols, rows, offset, showCode, selected, errors } = props;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.key));

  return (
    <div className="bg-card border rounded-2xl overflow-hidden">
      {/* Own scroll box so the sticky header actually sticks (a page-level
          scroll would slide it under the app bar) and long pages stay usable. */}
      <div className="overflow-auto max-h-[65vh]">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
          <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="p-2 w-10 border-b">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={props.onToggleAll}
                  aria-label="تحديد الكل"
                  className="w-4 h-4 align-middle"
                />
              </th>
              <th className="p-2 w-10 border-b text-center font-medium">#</th>
              {showCode && <th className="p-2 w-28 border-b text-right font-medium">الكود</th>}
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="p-2 border-b text-right font-medium whitespace-nowrap"
                  style={{ width: c.width }}
                >
                  {c.label}
                </th>
              ))}
              <th className="p-2 w-10 border-b"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <GridRowView
                key={row.key}
                row={row}
                r={r}
                index={offset + r + 1}
                cols={cols}
                showCode={showCode}
                selected={selected.has(row.key)}
                error={errors.get(row.key)}
                onToggle={props.onToggle}
                onChange={props.onChange}
                onKeyDown={props.onKeyDown}
                onFocusCell={props.onFocusCell}
                onRemove={props.onRemove}
                onRestore={props.onRestore}
                canDelete={props.canDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const GridRowView = memo(function GridRowView({
  row,
  r,
  index,
  cols,
  showCode,
  selected,
  error,
  onToggle,
  onChange,
  onKeyDown,
  onFocusCell,
  onRemove,
  onRestore,
  canDelete,
}: {
  row: GridRow;
  r: number;
  index: number;
  cols: GridCol[];
  showCode: boolean;
  selected: boolean;
  error?: string;
  onToggle: (key: string) => void;
  onChange: (key: string, col: GridColKey, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => void;
  onFocusCell: (r: number, c: number) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  canDelete: boolean;
}) {
  const dirty = isDirtyRow(row);
  return (
    <tr
      className={`border-b last:border-b-0 ${
        row.removed
          ? "bg-destructive/10 line-through opacity-70"
          : error
            ? "bg-destructive/5"
            : dirty
              ? "bg-warning/10"
              : "hover:bg-muted/40"
      }`}
    >
      <td className="p-1 text-center align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(row.key)}
          aria-label="تحديد الصف"
          className="w-4 h-4 align-middle"
        />
      </td>
      <td className="p-1 text-center text-xs text-muted-foreground font-mono align-middle">
        {index}
        {dirty && !row.removed && (
          <span className="text-warning" title="غير محفوظ">
            {" "}
            •
          </span>
        )}
      </td>
      {showCode && (
        <td className="p-1 text-xs font-mono text-muted-foreground align-middle whitespace-nowrap">
          {row.code || "تلقائي"}
        </td>
      )}
      {cols.map((c, ci) => (
        <td key={c.key} className="p-0.5">
          <input
            data-cell={`${r}-${ci}`}
            value={row.values[c.key]}
            disabled={row.removed}
            placeholder={c.placeholder}
            inputMode={c.type === "num" ? "decimal" : undefined}
            onChange={(e) => onChange(row.key, c.key, e.target.value)}
            onKeyDown={(e) => onKeyDown(e, r, ci)}
            onFocus={() => onFocusCell(r, ci)}
            className={`w-full h-9 px-2 rounded-md border bg-background text-sm outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-60 ${
              c.type === "num" ? "text-center font-mono" : ""
            } ${isDirtyCell(row, c.key) ? "border-warning bg-warning/5" : "border-transparent hover:border-border"}`}
          />
        </td>
      ))}
      <td className="p-1 text-center align-middle">
        {row.removed ? (
          <button
            type="button"
            onClick={() => onRestore(row.key)}
            title="تراجع عن الحذف"
            className="p-1.5 rounded-md hover:bg-muted"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        ) : (
          canDelete && (
            <button
              type="button"
              onClick={() => onRemove(row.key)}
              title={row.id ? "حذف الصنف" : "إزالة الصف"}
              className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )
        )}
      </td>
    </tr>
  );
});

export function GridErrorList({ errors }: { errors: Map<string, string> }) {
  if (errors.size === 0) return null;
  const msgs = Array.from(new Set(errors.values()));
  return (
    <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
      <div className="flex items-center gap-1 font-semibold">
        <AlertTriangle className="w-4 h-4" />
        {errors.size} صف يحتاج مراجعة
      </div>
      {msgs.slice(0, 4).map((m) => (
        <div key={m}>• {m}</div>
      ))}
    </div>
  );
}
