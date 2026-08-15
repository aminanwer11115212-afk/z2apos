/**
 * فحص سريع بلا متصفح — `bun scripts/smoke.tsx`
 *
 * يغطّي طبقتين لا تحتاجان قاعدة بيانات:
 *  1) دوال الحساب الصافية (التسعير، التقريب، التواريخ، تنسيق الفاتورة).
 *  2) تصيير المكوّنات الجديدة إلى HTML للتأكد من عدم انهيارها ومن ظهور
 *     العناصر المتوقعة (صفوف الجدول، الخلايا، أعمدة الطباعة الحرارية).
 *
 * ليس بديلاً عن اختبار الواجهة الحيّة في القائمة أدناه (docs/QA-CHECKLIST.md)،
 * لكنه يمسك الانكسارات الصامتة قبل النشر.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PartsGrid, type GridCol, type GridRow } from "@/components/PartsGrid";
import { getSettings, saleTotals, lowStockThreshold, isLowStock } from "@/lib/settings";
import {
  computeBulkPrice,
  roundPrice,
  unitPriceFor,
  parseNum,
  normalizeDigits,
  autoPartCode,
  marginPercent,
} from "@/lib/parts";
import { formatAmount, formatQty, formatInvoiceDate, type InvoiceDoc } from "@/lib/invoice";
import { dayKey, localISODate, rangeToInstants } from "@/lib/dates";
import {
  initialPaymentMethod,
  enabledPaymentMethods,
  accountsForMethod,
  defaultAccountIdFor,
  requiresRef,
} from "@/lib/payments";
import { dbErrorMessage } from "@/lib/db-errors";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}
function group(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------ التسعير ------------------------------ */
group("التسعير والحسابات");
const row = { cost_price: 100, sell_price: 150, wholesale_price: 120 };
check(
  "زيادة 10% على القطاعي",
  computeBulkPrice(row, "sell_price", { op: "increase_percent", value: 10, round: "none" }) === 165,
);
check(
  "تخفيض 10% من الجملة",
  computeBulkPrice(row, "wholesale_price", { op: "decrease_percent", value: 10, round: "none" }) ===
    108,
);
check(
  "زيادة مبلغ ثابت",
  computeBulkPrice(row, "sell_price", { op: "increase_amount", value: 25, round: "none" }) === 175,
);
check(
  "تعيين سعر موحّد",
  computeBulkPrice(row, "sell_price", { op: "set", value: 999, round: "none" }) === 999,
);
check(
  "التكلفة + هامش 30%",
  computeBulkPrice(row, "sell_price", { op: "margin_on_cost", value: 30, round: "none" }) === 130,
);
check(
  "نسخ من التكلفة + 20%",
  computeBulkPrice(row, "wholesale_price", {
    op: "copy_from",
    value: 20,
    source: "cost_price",
    round: "none",
  }) === 120,
);
check(
  "لا سعر سالب",
  computeBulkPrice(row, "sell_price", { op: "decrease_amount", value: 10_000, round: "none" }) ===
    0,
);
check(
  "تقريب لأقرب 50",
  computeBulkPrice(row, "sell_price", { op: "increase_percent", value: 7, round: "50" }) === 150,
);
check(
  "التقريب بلا كسور عائمة",
  roundPrice(0.07 * 3, "0.01") === 0.21,
  roundPrice(0.07 * 3, "0.01"),
);
check("هامش الربح", Math.round(marginPercent(100, 150)!) === 50);
check("هامش بلا تكلفة = null", marginPercent(0, 150) === null);

group("وضع السعر (قطاعي/جملة)");
check("قطاعي", unitPriceFor(row, "retail") === 150);
check("جملة", unitPriceFor(row, "wholesale") === 120);
check(
  "جملة غير محددة ترجع للقطاعي",
  unitPriceFor({ sell_price: 150, wholesale_price: 0 }, "wholesale") === 150,
);
check("جملة مفقودة ترجع للقطاعي", unitPriceFor({ sell_price: 150 }, "wholesale") === 150);

group("إدخال الأرقام العربية");
check("٢٥٠ → 250", parseNum("٢٥٠") === 250);
check("فاصل الآلاف", parseNum("1,250.5") === 1250.5);
check("فارغ = 0", parseNum("  ") === 0);
check("نص = NaN", Number.isNaN(parseNum("abc")));
check("تطبيع الفاصلة العربية", normalizeDigits("١٢٫٥") === "12.5");

group("أكواد الأصناف");
const codes = new Set(Array.from({ length: 500 }, () => autoPartCode()));
check("٥٠٠ كود بلا تكرار (دفعة واحدة)", codes.size === 500, codes.size);
check(
  "أرقام فقط بعد P",
  [...codes].every((c) => /^P\d+$/.test(c)),
);

group("إجماليات الفاتورة");
const totals = saleTotals({ total: 1000, discount: 100, tax_amount: 45 });
check("الصافي", totals.net === 900);
check("الإجمالي شامل الضريبة", totals.grand === 945);
check("تنسيق المبلغ", formatAmount(80391) === "80,391.00", formatAmount(80391));
check("تنسيق الكمية الصحيحة", formatQty(2) === "2");
check("تنسيق الكمية الكسرية", formatQty(1.5) === "1.5");
check(
  "تنسيق التاريخ",
  formatInvoiceDate("2026-07-09T10:00:00") === "09 / 07 / 2026",
  formatInvoiceDate("2026-07-09T10:00:00"),
);

group("التواريخ المحلية");
const noon = new Date(2026, 6, 9, 23, 30); // 11:30 مساءً محلياً
check("يوم محلي لا يقفز مع UTC", dayKey(noon) === "2026-07-09", dayKey(noon));
check("localISODate", localISODate(new Date(2026, 0, 5)) === "2026-01-05");
const inst = rangeToInstants("2026-07-01", "2026-07-31");
check("بداية النطاق قبل نهايته", inst.start < inst.end);

group("المخزون المنخفض");
const s = getSettings();
check("حد التنبيه الافتراضي", lowStockThreshold(0, s) === s.lowStockDefault);
check("حد التنبيه الخاص بالصنف", lowStockThreshold(3, s) === 3);
check("صنف منخفض", isLowStock({ quantity: 2, min_quantity: 3 }, s));
check("صنف غير منخفض", !isLowStock({ quantity: 50, min_quantity: 3 }, s));

group("طرق الدفع");
check("الطريقة الافتراضية مفعّلة", enabledPaymentMethods(s).includes(initialPaymentMethod(s)));
check(
  "حسابات النقدي نقدية فقط",
  accountsForMethod(s, "cash").every((a) => a.type === "cash"),
);
check(
  "حسابات البنكي غير نقدية",
  accountsForMethod(s, "bank").every((a) => a.type !== "cash"),
);
check("حساب افتراضي للطريقة", defaultAccountIdFor(s, "cash").length > 0);
check("النقدي لا يطلب مرجعاً", !requiresRef(s, "cash"));

group("رسائل أخطاء قاعدة البيانات");
check("مفتاح أجنبي", dbErrorMessage({ code: "23503" }).includes("مرتبط"));
check("قيمة مكررة", dbErrorMessage({ code: "23505" }).includes("مكرّرة"));
check(
  "سياسة الأمان",
  dbErrorMessage({ message: "new row violates row-level security policy" }).includes("صلاحية"),
);

/* ---------------------------- التصيير ---------------------------- */
group("تصيير الفاتورة");
const doc: InvoiceDoc = {
  invoiceLabel: "INV-1001",
  date: "2026-07-09T12:00:00",
  customerName: "حسن احمد حسن",
  customerPhone: "0960514233",
  items: [
    {
      id: "1",
      name: "إصطب خلفي يسار - بي ام دبليو (2022)",
      code: "P1",
      qty: 1,
      unit_price: 80391,
      subtotal: 80391,
    },
    {
      id: "2",
      name: "إصطب خلفي يسار - ميتسوبيشي (2012)",
      code: "P2",
      qty: 2,
      unit_price: 47103,
      subtotal: 94206,
    },
  ],
  total: 174597,
  discount: 0,
  tax: 0,
  net: 174597,
  grand: 174597,
  paid: 100000,
  due: 74597,
  paymentMethod: "cash",
  accountName: "الصندوق النقدي",
  notes: "ملاحظة تجريبية",
  customerBalance: 74597,
};
const settings = { ...s, invoiceMinRows: 8, storePhone: "0960514233" };
const a4 = renderToStaticMarkup(<InvoiceDocument doc={doc} settings={settings} format="a4" />);
const thermal = renderToStaticMarkup(
  <InvoiceDocument doc={doc} settings={settings} format="thermal80" />,
);

check("A4 يعرض العنوان", a4.includes(settings.invoiceTitle));
check("A4 يعرض اسم العميل", a4.includes("حسن احمد حسن"));
check("A4 يعرض المبالغ بصيغة الجدول", a4.includes("80,391.00"));
check("A4 يعرض أعمدة القالب", a4.includes("السعر (وحدة)") && a4.includes("الإجمالي"));
check(
  "A4 يكمل الصفوف الفارغة",
  (a4.match(/filler-row/g) ?? []).length === 6,
  (a4.match(/filler-row/g) ?? []).length,
);
check("A4 يعرض عمود الكود", a4.includes("الكود"));
check("A4 يعرض خانات التوقيع", a4.includes("توقيع المستلم"));
check("حراري بلا صفوف فارغة", !thermal.includes("filler-row"));
check("حراري بلا عمود كود", !thermal.includes("الكود"));
check("حراري يعرض الإجمالي", thermal.includes("174,597.00"));
check("المتبقي يظهر في الاثنين", a4.includes("74,597.00") && thermal.includes("74,597.00"));

group("تصيير شبكة الأصناف");
const cols: GridCol[] = [
  { key: "name", label: "الاسم", type: "text", width: "30%" },
  { key: "sell_price", label: "قطاعي", type: "num", width: "20%" },
  { key: "wholesale_price", label: "جملة", type: "num", width: "20%" },
];
const mkRow = (i: number): GridRow => ({
  key: `k${i}`,
  id: `id${i}`,
  code: `P${i}`,
  values: {
    name: `صنف ${i}`,
    car_model: "",
    category: "",
    cost_price: "10",
    sell_price: "20",
    wholesale_price: "15",
    quantity: "5",
    min_quantity: "1",
  },
  base: {
    name: `صنف ${i}`,
    car_model: "",
    category: "",
    cost_price: "10",
    sell_price: "20",
    wholesale_price: "15",
    quantity: "5",
    min_quantity: "1",
  },
  removed: false,
});
const rows = [mkRow(1), mkRow(2), mkRow(3)];
rows[1].values.sell_price = "25"; // صف معدّل
const grid = renderToStaticMarkup(
  <PartsGrid
    cols={cols}
    rows={rows}
    offset={0}
    showCode
    selected={new Set(["k1"])}
    errors={new Map()}
    onToggle={() => {}}
    onToggleAll={() => {}}
    onChange={() => {}}
    onKeyDown={() => {}}
    onFocusCell={() => {}}
    onRemove={() => {}}
    onRestore={() => {}}
    canDelete
  />,
);
check(
  "عدد الخلايا = صفوف × أعمدة",
  (grid.match(/data-cell=/g) ?? []).length === rows.length * cols.length,
);
check(
  "إحداثيات الخلايا صحيحة",
  grid.includes('data-cell="0-0"') && grid.includes('data-cell="2-2"'),
);
check("عرض الأكواد", grid.includes("P1") && grid.includes("P3"));
check("تمييز الصف المعدّل", grid.includes("bg-warning/10"));
check("تحديد الصف الأول", (grid.match(/checked=""/g) ?? []).length >= 1);

console.log(failures === 0 ? "\n✅ كل الفحوصات نجحت" : `\n❌ ${failures} فحص فشل`);
process.exit(failures === 0 ? 0 : 1);
