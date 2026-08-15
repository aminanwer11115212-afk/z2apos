import { Logo } from "@/components/Logo";
import { paymentMethodIcon, paymentMethodLabel } from "@/lib/payments";
import type { PrintFormat, Settings } from "@/lib/settings";
import {
  formatAmount,
  formatQty,
  formatInvoiceDate,
  formatInvoiceTime,
  type InvoiceDoc,
} from "@/lib/invoice";

/**
 * The printable invoice sheet.
 *
 * One markup tree serves every paper size: `format` only switches density and
 * drops the pieces a 58/80mm roll cannot carry (second logo, code column, the
 * blank filler rows that keep an A4 table looking like the pre-printed pad).
 * Everything that must survive printing lives under `.print-area`, which the
 * global print stylesheet targets.
 */
export function InvoiceDocument({
  doc,
  settings,
  format,
  copyLabel,
}: {
  doc: InvoiceDoc;
  settings: Settings;
  format: PrintFormat;
  /** e.g. "نسخة العميل" — printed under the title when set. */
  copyLabel?: string;
}) {
  const thermal = format !== "a4";
  const showCode = settings.showItemCode && !thermal;
  const fillers = thermal
    ? 0
    : Math.max(0, Number(settings.invoiceMinRows || 0) - doc.items.length);
  const cols = 4 + (showCode ? 1 : 0);
  const cell = thermal ? "p-1" : "p-2";

  return (
    <div
      className={`print-area invoice-doc bg-card border rounded-2xl shadow-sm ${
        thermal ? "p-3 text-[11px]" : "p-6 text-sm"
      }`}
    >
      {/* ---- Header: logo · title · logo ---- */}
      <div className="flex items-start justify-between gap-2">
        {settings.showLogo && (
          <Logo variant="light" className={thermal ? "h-10 w-auto" : "h-16 w-auto"} />
        )}
        <div className="flex-1 text-center leading-tight">
          <div className={`font-extrabold tracking-tight ${thermal ? "text-lg" : "text-4xl"}`}>
            {settings.invoiceTitle || "فاتورة"}
          </div>
          <div className={`font-bold mt-1 ${thermal ? "text-sm" : "text-xl"}`}>
            {settings.storeName || "نظام 2A"}
          </div>
          {settings.storePhone && (
            <div
              className={`muted-print text-muted-foreground ${thermal ? "text-[10px]" : "text-base"}`}
            >
              TEL: <span dir="ltr">{settings.storePhone}</span>
            </div>
          )}
          {copyLabel && (
            <div className="mt-1 text-[10px] muted-print text-muted-foreground">{copyLabel}</div>
          )}
        </div>
        {settings.showLogo && !thermal && <Logo variant="light" className="h-16 w-auto" />}
      </div>

      {/* ---- Meta line: date · invoice no · customer ----
           A roll is too narrow for three fields side by side, so thermal
           stacks them; A4 keeps the single ruled line of the paper template. */}
      <div
        className={`mt-4 gap-x-6 gap-y-1.5 ${
          thermal ? "grid grid-cols-1 text-[11px]" : "flex flex-wrap items-end text-base"
        }`}
      >
        <MetaField
          label="التاريخ"
          value={formatInvoiceDate(doc.date)}
          width={thermal ? "" : "w-52 shrink-0"}
          nowrap
        />
        <MetaField
          label="رقم الفاتورة"
          value={doc.invoiceLabel}
          width={thermal ? "" : "w-44 shrink-0"}
          mono
          nowrap
        />
        <MetaField
          label="اسم العميل"
          value={doc.customerName || "نقدي"}
          width={thermal ? "" : "flex-1 min-w-48"}
        />
      </div>

      {/* ---- Items ---- */}
      <table
        className={`w-full invoice-table mt-3 ${thermal ? "text-[10px]" : ""}`}
        style={{ borderCollapse: "collapse", tableLayout: thermal ? "auto" : undefined }}
      >
        <thead>
          <tr className="bg-muted">
            <th className={`border text-center font-bold ${thermal ? "p-1 w-5" : "p-2 w-10"}`}>
              م
            </th>
            <th className={`border text-center font-bold ${thermal ? "p-1" : "p-2"}`}>الصنف</th>
            {showCode && <th className="border p-2 text-center font-bold w-24">الكود</th>}
            <th className={`border text-center font-bold ${thermal ? "p-1" : "p-2 w-32"}`}>
              السعر {thermal ? "" : "(وحدة)"}
            </th>
            <th className={`border text-center font-bold ${thermal ? "p-1 w-8" : "p-2 w-16"}`}>
              الكمية
            </th>
            <th className={`border text-center font-bold ${thermal ? "p-1" : "p-2 w-32"}`}>
              الإجمالي
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={it.id}>
              <td className={`border text-center font-mono ${cell}`}>{i + 1}</td>
              <td className={`border text-right ${cell}`}>{it.name}</td>
              {showCode && (
                <td className="border p-2 text-center font-mono text-xs muted-print text-muted-foreground">
                  {it.code || "—"}
                </td>
              )}
              <td className={`border text-center font-mono whitespace-nowrap ${cell}`} dir="ltr">
                {formatAmount(it.unit_price)}
              </td>
              <td className={`border text-center font-mono ${cell}`}>{formatQty(it.qty)}</td>
              <td
                className={`border text-center font-mono font-semibold whitespace-nowrap ${cell}`}
                dir="ltr"
              >
                {formatAmount(it.subtotal)}
              </td>
            </tr>
          ))}
          {/* Blank rows so a short A4 invoice still fills the ruled table. */}
          {Array.from({ length: fillers }, (_, i) => (
            <tr key={`f${i}`} className="filler-row">
              <td
                className={`border text-center font-mono muted-print text-muted-foreground ${cell}`}
              >
                {doc.items.length + i + 1}
              </td>
              <td className="border p-2">&nbsp;</td>
              {showCode && <td className="border p-2">&nbsp;</td>}
              <td className="border p-2">&nbsp;</td>
              <td className="border p-2">&nbsp;</td>
              <td className="border p-2">&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted">
            <td className={`border text-center font-bold ${cell}`} colSpan={cols}>
              الإجمالي الكلي
            </td>
            <td
              className={`border text-center font-extrabold font-mono whitespace-nowrap ${cell}`}
              dir="ltr"
            >
              {formatAmount(doc.grand)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ---- Details + totals ---- */}
      <div className={`mt-4 grid gap-3 ${thermal ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        <div className="rounded-lg border p-3 space-y-1 text-xs">
          <div className="font-bold mb-1">بيانات الدفع</div>
          {doc.paymentMethod && (
            <DetailRow
              label="طريقة الدفع"
              value={`${paymentMethodIcon(doc.paymentMethod)} ${paymentMethodLabel(doc.paymentMethod)}`}
            />
          )}
          {doc.accountName && <DetailRow label="الحساب" value={doc.accountName} />}
          {doc.txRef && <DetailRow label="رقم العملية" value={doc.txRef} mono />}
          {doc.customerPhone && <DetailRow label="هاتف العميل" value={doc.customerPhone} mono />}
          {typeof doc.customerBalance === "number" && doc.customerBalance !== 0 && (
            <DetailRow
              label={doc.customerBalance > 0 ? "رصيد العميل (عليه)" : "رصيد العميل (له)"}
              value={formatAmount(Math.abs(doc.customerBalance))}
            />
          )}
          <DetailRow label="وقت الإصدار" value={formatInvoiceTime(doc.date)} />
          {doc.notes && (
            <div className="pt-1 border-t mt-1">
              <span className="muted-print text-muted-foreground">ملاحظات: </span>
              {doc.notes}
            </div>
          )}
        </div>

        <div className="rounded-lg border p-3 text-sm">
          <TotalRow label="الإجمالي" value={doc.total} />
          {doc.discount > 0 && <TotalRow label="الخصم" value={doc.discount} minus />}
          {(doc.discount > 0 || doc.tax > 0) && <TotalRow label="الصافي" value={doc.net} />}
          {doc.tax > 0 && <TotalRow label="الضريبة" value={doc.tax} />}
          <TotalRow label="الإجمالي المستحق" value={doc.grand} strong />
          <TotalRow label="المدفوع" value={doc.paid} />
          <TotalRow label="المتبقي" value={doc.due} strong highlight />
        </div>
      </div>

      {/* ---- Signatures ---- */}
      {settings.showSignature && !thermal && (
        <div className="mt-8 grid grid-cols-2 gap-10 text-xs">
          <SignatureLine label="توقيع المستلم" />
          <SignatureLine label="توقيع البائع / الختم" />
        </div>
      )}

      {/* ---- Footer ---- */}
      <div className="mt-6 pt-3 border-t text-center text-[10px] leading-relaxed muted-print text-muted-foreground">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center">
          {settings.storePhone && <span dir="ltr">📞 {settings.storePhone}</span>}
          {settings.storeAddress && (
            <span className="hide-on-thermal">📍 {settings.storeAddress}</span>
          )}
          {settings.storeTaxNo && <span>الرقم الضريبي: {settings.storeTaxNo}</span>}
        </div>
        <div className="mt-1 font-medium">{settings.invoiceFooter || "شكراً لتعاملكم معنا"}</div>
        <div className="mt-0.5 hide-on-thermal opacity-70">نظام 2A — من تطوير أمين أنور أحمد</div>
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  width = "",
  mono,
  nowrap,
}: {
  label: string;
  value: string;
  width?: string;
  mono?: boolean;
  nowrap?: boolean;
}) {
  return (
    <div className={`flex items-end gap-2 ${width}`}>
      <span className="font-bold whitespace-nowrap">{label}:</span>
      <span
        className={`flex-1 border-b border-dotted text-center pb-0.5 font-semibold ${
          mono ? "font-mono" : ""
        } ${nowrap ? "whitespace-nowrap" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="muted-print text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""} dir={mono ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  minus,
  highlight,
}: {
  label: string;
  value: number;
  strong?: boolean;
  minus?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center py-1 ${strong ? "font-bold border-t mt-1 pt-1.5" : ""} ${
        highlight ? "bg-muted rounded px-1.5" : ""
      }`}
    >
      <span className={strong ? "" : "muted-print text-muted-foreground"}>{label}</span>
      <span className="font-mono" dir="ltr">
        {minus ? "-" : ""}
        {formatAmount(value)}
      </span>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="h-10" />
      <div className="border-t border-dotted pt-1 muted-print text-muted-foreground">{label}</div>
    </div>
  );
}
