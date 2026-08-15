import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/auth";
import { PART_SELECT, autoPartCode, parseNum, type Part } from "@/lib/parts";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  PartsGrid,
  GridErrorList,
  isDirtyRow,
  type GridCol,
  type GridColKey,
  type GridRow,
  type GridValues,
} from "@/components/PartsGrid";
import { BulkPriceDialog, type BulkTargetRow } from "@/components/BulkPriceDialog";
import { PageHeader, SearchBar, Btn } from "@/components/ui-kit";
import {
  ArrowRight,
  Plus,
  Save,
  Wand2,
  Keyboard,
  Undo2,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/parts/bulk")({
  head: () => ({ meta: [{ title: "إدارة الأصناف دفعة واحدة — 2A" }] }),
  component: BulkPartsPage,
});

const COLS: GridCol[] = [
  { key: "name", label: "الاسم *", type: "text", width: "24%", placeholder: "اسم الصنف" },
  { key: "car_model", label: "نوع السيارة", type: "text", width: "15%", placeholder: "تويوتا" },
  { key: "category", label: "الفئة", type: "text", width: "13%", placeholder: "فلاتر" },
  { key: "cost_price", label: "التكلفة", type: "num", width: "10%" },
  { key: "sell_price", label: "قطاعي", type: "num", width: "10%" },
  { key: "wholesale_price", label: "جملة", type: "num", width: "10%" },
  { key: "quantity", label: "الكمية", type: "num", width: "9%" },
  { key: "min_quantity", label: "حد التنبيه", type: "num", width: "9%" },
];

const NUM_COLS: GridColKey[] = [
  "cost_price",
  "sell_price",
  "wholesale_price",
  "quantity",
  "min_quantity",
];

const BLANK: GridValues = {
  name: "",
  car_model: "",
  category: "",
  cost_price: "",
  sell_price: "",
  wholesale_price: "",
  quantity: "",
  min_quantity: "",
};

const NEW_ROWS_BATCH = 10;
const PAGE_SIZES = [25, 50, 100, 200];

let seq = 0;
const nextKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const blankRow = (): GridRow => ({
  key: nextKey(),
  id: null,
  code: "",
  values: { ...BLANK },
  base: null,
  removed: false,
});

const blankRows = (n: number) => Array.from({ length: n }, blankRow);

function toRow(p: Part): GridRow {
  const values: GridValues = {
    name: p.name ?? "",
    car_model: p.car_model ?? "",
    category: p.category ?? "",
    cost_price: String(Number(p.cost_price) || 0),
    sell_price: String(Number(p.sell_price) || 0),
    wholesale_price: String(Number(p.wholesale_price) || 0),
    quantity: String(Number(p.quantity) || 0),
    min_quantity: String(Number(p.min_quantity) || 0),
  };
  return { key: p.id, id: p.id, code: p.code, values, base: { ...values }, removed: false };
}

/** A row counts as "filled" once anything was typed into it. */
const isTouched = (r: GridRow) => Object.values(r.values).some((v) => v.trim() !== "");

function BulkPartsPage() {
  const qc = useQueryClient();
  const { data: role } = useMyRole();
  const isAdmin = role === "admin";

  const [mode, setMode] = useState<"edit" | "add">("edit");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editRows, setEditRows] = useState<GridRow[]>([]);
  const [addRows, setAddRows] = useState<GridRow[]>(() => blankRows(NEW_ROWS_BATCH));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cursor = useRef({ r: 0, c: 0 });
  const pendingFocus = useRef<{ r: number; c: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["parts-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select(PART_SELECT).order("name");
      if (error) throw error;
      return data as Part[];
    },
  });

  // Seed the editable copy from the server, but never clobber unsaved edits —
  // a background refetch must not throw away what the user is typing.
  useEffect(() => {
    if (!data) return;
    setEditRows((prev) => (prev.some(isDirtyRow) ? prev : data.map(toRow)));
  }, [data]);

  const s = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (mode === "add") return addRows;
    if (!s) return editRows;
    return editRows.filter((r) =>
      [r.code, r.values.name, r.values.category, r.values.car_model]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [mode, addRows, editRows, s]);

  const pageCount = mode === "add" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const offset = mode === "add" ? 0 : (pageSafe - 1) * pageSize;
  const visible = useMemo(
    () => (mode === "add" ? addRows : filtered.slice(offset, offset + pageSize)),
    [mode, addRows, filtered, offset, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [q, mode, pageSize]);

  /* ---------------- row mutation helpers ---------------- */

  const patchRow = useCallback(
    (key: string, fn: (r: GridRow) => GridRow) => {
      const apply = (rows: GridRow[]) => rows.map((r) => (r.key === key ? fn(r) : r));
      setAddRows((rows) => (rows.some((r) => r.key === key) ? apply(rows) : rows));
      setEditRows((rows) => (rows.some((r) => r.key === key) ? apply(rows) : rows));
    },
    [setAddRows, setEditRows],
  );

  const onChange = useCallback(
    (key: string, col: GridColKey, value: string) =>
      patchRow(key, (r) => ({ ...r, values: { ...r.values, [col]: value } })),
    [patchRow],
  );

  const removeRow = useCallback(
    (key: string) => {
      // New rows just disappear; saved ones are marked and deleted on save.
      setAddRows((rows) => rows.filter((r) => r.key !== key));
      setEditRows((rows) => rows.map((r) => (r.key === key ? { ...r, removed: true } : r)));
    },
    [setAddRows, setEditRows],
  );

  const restoreRow = useCallback(
    (key: string) => patchRow(key, (r) => ({ ...r, removed: false })),
    [patchRow],
  );

  const addBatch = (n = NEW_ROWS_BATCH) => setAddRows((rows) => [...rows, ...blankRows(n)]);

  const revertAll = () => {
    if (mode === "add") {
      setAddRows(blankRows(NEW_ROWS_BATCH));
    } else {
      setEditRows((rows) =>
        rows.map((r) => (r.base ? { ...r, values: { ...r.base }, removed: false } : r)),
      );
    }
    setSelected(new Set());
    toast.success("تم التراجع عن التعديلات غير المحفوظة");
  };

  /* ---------------- focus / keyboard navigation ---------------- */

  const focusCell = useCallback((r: number, c: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    let el = grid.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`);
    if (!el) {
      // The requested row may not exist on a short last page — fall back to the
      // last row in that column instead of dropping focus out of the grid.
      const inCol = grid.querySelectorAll<HTMLInputElement>(`[data-cell$="-${c}"]`);
      el = inCol[inCol.length - 1] ?? null;
      if (!el) return;
      r = Number(el.dataset.cell!.split("-")[0]);
    }
    el.focus();
    el.select();
    cursor.current = { r, c };
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { r, c } = pendingFocus.current;
    pendingFocus.current = null;
    focusCell(r, c);
  });

  const goto = useCallback(
    (r: number, c: number, appendOnOverflow = false) => {
      const col = Math.max(0, Math.min(COLS.length - 1, c));
      const last = visible.length - 1;
      if (r > last) {
        if (mode === "add" && (appendOnOverflow || r === last + 1)) {
          setAddRows((rows) => [...rows, blankRow()]);
          pendingFocus.current = { r: last + 1, c: col };
          return;
        }
        if (mode === "edit" && pageSafe < pageCount) {
          setPage(pageSafe + 1);
          pendingFocus.current = { r: 0, c: col };
          return;
        }
        return focusCell(last, col);
      }
      if (r < 0) {
        if (mode === "edit" && pageSafe > 1) {
          setPage(pageSafe - 1);
          pendingFocus.current = { r: pageSize - 1, c: col };
          return;
        }
        return focusCell(0, col);
      }
      focusCell(r, col);
    },
    [visible.length, mode, pageSafe, pageCount, pageSize, focusCell],
  );

  const copyFromAbove = (r: number, c: number, fillDown: boolean) => {
    if (r === 0 && !fillDown) return;
    const col = COLS[c].key;
    if (fillDown) {
      const value = visible[r]?.values[col] ?? "";
      const keys = new Set(visible.slice(r + 1).map((x) => x.key));
      const apply = (rows: GridRow[]) =>
        rows.map((x) => (keys.has(x.key) ? { ...x, values: { ...x.values, [col]: value } } : x));
      if (mode === "add") setAddRows(apply);
      else setEditRows(apply);
      toast.success(`تمت التعبئة لأسفل (${keys.size} صف)`);
      return;
    }
    const value = visible[r - 1].values[col];
    onChange(visible[r].key, col, value);
  };

  const cellKeyRef = useRef<
    (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => void
  >(() => {});
  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => cellKeyRef.current(e, r, c),
    [],
  );
  cellKeyRef.current = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    const col = COLS[c];
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      goto(r + dr, c + dc);
    };
    // Numeric cells hand Left/Right straight to navigation — the values are short
    // and users retype them; text cells only leave the field from its edges.
    const leaveStart = col.type === "num" || e.ctrlKey || el.selectionStart === 0;
    const leaveEnd = col.type === "num" || e.ctrlKey || el.selectionEnd === el.value.length;

    if (e.code === "KeyD" && e.ctrlKey) {
      e.preventDefault();
      return copyFromAbove(r, c, e.shiftKey);
    }
    // Ctrl+S is handled once, by the window listener below.
    switch (e.key) {
      case "ArrowDown":
        return move(1, 0);
      case "ArrowUp":
        return move(-1, 0);
      case "ArrowRight":
        // RTL grid: the visually-right neighbour is the previous column.
        if (leaveStart) return move(0, -1);
        return;
      case "ArrowLeft":
        if (leaveEnd) return move(0, 1);
        return;
      case "Enter":
        e.preventDefault();
        return e.shiftKey ? goto(r - 1, c) : goto(r + 1, c, true);
      case "Tab": {
        e.preventDefault();
        if (e.shiftKey) return c === 0 ? goto(r - 1, COLS.length - 1) : goto(r, c - 1);
        return c === COLS.length - 1 ? goto(r + 1, 0, true) : goto(r, c + 1);
      }
      case "Home":
        e.preventDefault();
        return goto(e.ctrlKey ? 0 : r, 0);
      case "End":
        e.preventDefault();
        return goto(e.ctrlKey ? visible.length - 1 : r, COLS.length - 1);
      case "PageDown":
        return move(10, 0);
      case "PageUp":
        return move(-10, 0);
      case "Escape": {
        e.preventDefault();
        const row = visible[r];
        return onChange(row.key, col.key, row.base ? row.base[col.key] : "");
      }
      case "Delete":
        if (e.altKey) {
          e.preventDefault();
          return removeRow(visible[r].key);
        }
        return;
      case " ":
        if (e.ctrlKey) {
          e.preventDefault();
          return toggleSelect(visible[r].key);
        }
        return;
      default:
        return;
    }
  };

  const onFocusCell = useCallback((r: number, c: number) => {
    cursor.current = { r, c };
  }, []);

  /* ---------------- selection ---------------- */

  const toggleSelect = useCallback(
    (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = visible.every((r) => next.has(r.key));
      for (const r of visible) {
        if (all) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });
  }, [visible]);

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((r) => r.key)));
    toast.success(`تم تحديد ${filtered.length} صنف`);
  };

  const selectedRows: BulkTargetRow[] = useMemo(() => {
    const pool = mode === "add" ? addRows : editRows;
    return pool
      .filter((r) => selected.has(r.key) && !r.removed)
      .map((r) => ({
        key: r.key,
        name: r.values.name,
        cost_price: parseNum(r.values.cost_price) || 0,
        sell_price: parseNum(r.values.sell_price) || 0,
        wholesale_price: parseNum(r.values.wholesale_price) || 0,
      }));
  }, [mode, addRows, editRows, selected]);

  /* ---------------- validation ---------------- */

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    const pool = mode === "add" ? addRows : editRows;
    for (const r of pool) {
      if (r.removed) continue;
      if (mode === "add" && !isTouched(r)) continue;
      if (!isDirtyRow(r)) continue;
      if (!r.values.name.trim()) {
        map.set(r.key, "الاسم مطلوب في كل صف مُعبّأ");
        continue;
      }
      const bad = NUM_COLS.find((k) => {
        const raw = r.values[k].trim();
        if (raw === "") return false;
        const n = parseNum(raw);
        return Number.isNaN(n) || n < 0;
      });
      if (bad) map.set(r.key, "أرقام غير صالحة (لا تُقبل القيم السالبة أو النصوص)");
    }
    return map;
  }, [mode, addRows, editRows]);

  const dirtyCount = useMemo(() => {
    const pool = mode === "add" ? addRows : editRows;
    return pool.filter((r) => (mode === "add" ? isTouched(r) : isDirtyRow(r))).length;
  }, [mode, addRows, editRows]);

  /* ---------------- save ---------------- */

  const payloadOf = (r: GridRow) => ({
    name: r.values.name.trim(),
    category: r.values.category.trim() || null,
    car_model: r.values.car_model.trim() || null,
    cost_price: parseNum(r.values.cost_price) || 0,
    sell_price: parseNum(r.values.sell_price) || 0,
    wholesale_price: parseNum(r.values.wholesale_price) || 0,
    quantity: parseNum(r.values.quantity) || 0,
    min_quantity: parseNum(r.values.min_quantity) || 0,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (errors.size > 0) throw new Error("راجع الصفوف المعلّمة بالأحمر قبل الحفظ");
      if (mode === "add") {
        const rows = addRows.filter(isTouched);
        if (rows.length === 0) throw new Error("لا توجد صفوف لإضافتها");
        const payload = rows.map((r) => ({ ...payloadOf(r), code: autoPartCode() }));
        for (let i = 0; i < payload.length; i += 200) {
          const { error } = await supabase.from("parts").insert(payload.slice(i, i + 200));
          if (error) throw new Error(dbErrorMessage(error, "تعذّرت إضافة الأصناف"));
        }
        return { added: payload.length, updated: 0, deleted: 0 };
      }

      const changed = editRows.filter((r) => r.id && !r.removed && isDirtyRow(r));
      const dropped = editRows.filter((r) => r.id && r.removed).map((r) => r.id!);
      if (changed.length === 0 && dropped.length === 0) throw new Error("لا توجد تعديلات للحفظ");
      // upsert keeps it to one round-trip per 200 rows instead of one per row.
      const payload = changed.map((r) => ({ id: r.id!, code: r.code, ...payloadOf(r) }));
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from("parts").upsert(payload.slice(i, i + 200));
        if (error) throw new Error(dbErrorMessage(error, "تعذّر حفظ التعديلات"));
      }
      for (let i = 0; i < dropped.length; i += 200) {
        const { error } = await supabase
          .from("parts")
          .delete()
          .in("id", dropped.slice(i, i + 200));
        if (error)
          throw new Error(
            dbErrorMessage(error, "تعذّر حذف الأصناف — قد تكون مرتبطة بفواتير سابقة"),
          );
      }
      return { added: 0, updated: changed.length, deleted: dropped.length };
    },
    onSuccess: (r) => {
      const parts = [
        r.added ? `${r.added} إضافة` : "",
        r.updated ? `${r.updated} تعديل` : "",
        r.deleted ? `${r.deleted} حذف` : "",
      ].filter(Boolean);
      toast.success(`تم الحفظ — ${parts.join(" · ")}`);
      setSelected(new Set());
      if (mode === "add") {
        setAddRows(blankRows(NEW_ROWS_BATCH));
      } else {
        // Rebase on what was just written instead of waiting for the refetch, so
        // the grid keeps its scroll/page and stops showing rows as modified.
        setEditRows((rows) =>
          rows
            .filter((r) => !r.removed)
            .map((r) => ({ ...r, values: { ...r.values }, base: { ...r.values } })),
        );
      }
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Window-level shortcuts close over save/mode, so keep the latest handler in a
  // ref and register the listener once (same pattern as the POS screen).
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    if (!save.isPending && dirtyCount > 0) save.mutate();
  };
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.key === "F9" || (e.ctrlKey && e.code === "KeyS")) {
      e.preventDefault();
      saveRef.current();
    } else if (e.key === "F2") {
      e.preventDefault();
      searchRef.current?.querySelector("input")?.focus();
    } else if (e.key === "F4") {
      e.preventDefault();
      if (mode === "add") {
        addBatch();
        toast.success(`+${NEW_ROWS_BATCH} صفوف`);
      }
    } else if (e.key === "F8") {
      e.preventDefault();
      setBulkOpen(true);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (role !== undefined && !isAdmin)
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للمديرين فقط</div>;

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto pb-28">
      <PageHeader
        title="إدارة الأصناف دفعة واحدة"
        subtitle={
          mode === "add"
            ? `${addRows.filter(isTouched).length} صف مُعبّأ من ${addRows.length}`
            : `${filtered.length} صنف${dirtyCount ? ` · ${dirtyCount} تعديل غير محفوظ` : ""}`
        }
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Link to="/parts">
              <Btn variant="outline">
                <ArrowRight className="w-4 h-4 inline ml-1" />
                القائمة
              </Btn>
            </Link>
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="h-10 px-3 rounded-lg border bg-card hover:bg-muted text-sm flex items-center gap-1"
            >
              <Keyboard className="w-4 h-4" />
              الاختصارات
            </button>
          </div>
        }
      />

      {helpOpen && (
        <div className="mb-4 rounded-2xl border bg-card p-4 text-xs grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-muted-foreground">
          <Shortcut k="↑ ↓ → ←" d="التنقل بين الخلايا" />
          <Shortcut k="Enter" d="الخلية التالية للأسفل (وصف جديد في وضع الإضافة)" />
          <Shortcut k="Shift+Enter" d="الخلية السابقة للأعلى" />
          <Shortcut k="Tab / Shift+Tab" d="الخلية التالية / السابقة" />
          <Shortcut k="Ctrl+D" d="نسخ قيمة الخلية الأعلى" />
          <Shortcut k="Ctrl+Shift+D" d="تعبئة القيمة لكل الصفوف أسفلها" />
          <Shortcut k="Home / End" d="أول / آخر عمود (مع Ctrl: أول / آخر صف)" />
          <Shortcut k="PageUp / PageDown" d="قفزة 10 صفوف" />
          <Shortcut k="Esc" d="تراجع عن تعديل الخلية" />
          <Shortcut k="Ctrl+Space" d="تحديد / إلغاء تحديد الصف" />
          <Shortcut k="Alt+Delete" d="حذف الصف" />
          <Shortcut k="F2" d="البحث" />
          <Shortcut k="F4" d="إضافة 10 صفوف" />
          <Shortcut k="F8" d="تعديل الأسعار الجماعي" />
          <Shortcut k="F9 / Ctrl+S" d="حفظ" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-xl border bg-card p-0.5">
          {(["edit", "add"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {m === "edit" ? "تعديل الأصناف" : "إضافة أصناف"}
            </button>
          ))}
        </div>

        {mode === "edit" && (
          <div ref={searchRef} className="flex-1 min-w-52">
            <SearchBar value={q} onChange={setQ} placeholder="بحث بالكود، الاسم، الفئة... (F2)" />
          </div>
        )}

        {mode === "add" && (
          <Btn variant="outline" onClick={() => addBatch()}>
            <Plus className="w-4 h-4 inline ml-1" />
            {NEW_ROWS_BATCH} صفوف (F4)
          </Btn>
        )}

        <Btn
          variant="outline"
          onClick={() => setBulkOpen(true)}
          disabled={selectedRows.length === 0}
        >
          <Wand2 className="w-4 h-4 inline ml-1" />
          تعديل الأسعار ({selectedRows.length})
        </Btn>
        <Btn variant="outline" onClick={selectAllFiltered}>
          <CheckSquare className="w-4 h-4 inline ml-1" />
          تحديد الكل
        </Btn>
        {selected.size > 0 && (
          <Btn variant="ghost" onClick={() => setSelected(new Set())}>
            <Square className="w-4 h-4 inline ml-1" />
            إلغاء التحديد
          </Btn>
        )}
        {dirtyCount > 0 && (
          <Btn variant="ghost" onClick={revertAll}>
            <Undo2 className="w-4 h-4 inline ml-1" />
            تراجع
          </Btn>
        )}
      </div>

      {isLoading && mode === "edit" ? (
        <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>
      ) : (
        <div ref={gridRef}>
          <PartsGrid
            cols={COLS}
            rows={visible}
            offset={offset}
            showCode={mode === "edit"}
            selected={selected}
            errors={errors}
            onToggle={toggleSelect}
            onToggleAll={toggleAllVisible}
            onChange={onChange}
            onKeyDown={onCellKeyDown}
            onFocusCell={onFocusCell}
            onRemove={removeRow}
            onRestore={restoreRow}
            canDelete={isAdmin}
          />
        </div>
      )}

      <GridErrorList errors={errors} />

      {mode === "edit" && pageCount > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <button
            onClick={() => setPage(Math.max(1, pageSafe - 1))}
            disabled={pageSafe === 1}
            className="h-9 px-3 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4" />
            السابق
          </button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>
              صفحة {pageSafe} من {pageCount}
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 px-2 rounded-lg border bg-card"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / صفحة
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setPage(Math.min(pageCount, pageSafe + 1))}
            disabled={pageSafe === pageCount}
            className="h-9 px-3 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 flex items-center gap-1"
          >
            التالي
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sticky save bar — the grid is long, the action must always be reachable. */}
      <div className="fixed bottom-0 inset-x-0 lg:right-60 z-20 border-t bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          {dirtyCount > 0 ? (
            <span className="font-medium">
              {dirtyCount} {mode === "add" ? "صف جاهز للإضافة" : "صف مُعدّل"}
              {errors.size > 0 && (
                <span className="text-destructive"> · {errors.size} يحتاج مراجعة</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">لا توجد تغييرات</span>
          )}
        </div>
        <Btn
          onClick={() => save.mutate()}
          disabled={save.isPending || dirtyCount === 0 || errors.size > 0}
        >
          <Save className="w-4 h-4 inline ml-1" />
          {save.isPending ? "جارٍ الحفظ..." : "حفظ (F9)"}
        </Btn>
      </div>

      <BulkPriceDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        rows={selectedRows}
        onApply={(results) => {
          const byKey = new Map<string, Partial<GridValues>>();
          for (const res of results) {
            const cur = byKey.get(res.key) ?? {};
            cur[res.field] = String(res.value);
            byKey.set(res.key, cur);
          }
          const apply = (rows: GridRow[]) =>
            rows.map((r) => {
              const patch = byKey.get(r.key);
              return patch ? { ...r, values: { ...r.values, ...patch } } : r;
            });
          setAddRows(apply);
          setEditRows(apply);
          toast.success(`تم تعديل أسعار ${byKey.size} صنف — راجع ثم احفظ`);
        }}
      />
    </div>
  );
}

function Shortcut({ k, d }: { k: string; d: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[11px] whitespace-nowrap">
        {k}
      </kbd>
      <span>{d}</span>
    </div>
  );
}
