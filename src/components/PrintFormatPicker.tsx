import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Btn } from "@/components/ui-kit";
import type { PrintFormat } from "@/lib/settings";

const OPTIONS: { v: PrintFormat; label: string }[] = [
  { v: "a4", label: "A4" },
  { v: "thermal80", label: "حراري 80mm" },
  { v: "thermal58", label: "حراري 58mm" },
];

const FORMAT_CLASSES = ["print-format-a4", "print-format-thermal80", "print-format-thermal58"];

/**
 * Small inline picker that applies `body.print-format-*` and triggers print.
 * Lets the user choose the paper format from the invoice itself, overriding
 * the default from settings for a single print run.
 *
 * This component owns the body class outright: it clears every format class on
 * unmount, so a thermal choice can't leak onto pages printed later (statements,
 * reports, barcode labels), which all rely on the A4 fallback rule.
 */
export function PrintFormatPicker({ initial = "a4" }: { initial?: PrintFormat }) {
  const [fmt, setFmt] = useState<PrintFormat>(initial);

  useEffect(() => {
    document.body.classList.remove(...FORMAT_CLASSES);
    document.body.classList.add(`print-format-${fmt}`);
    return () => document.body.classList.remove(...FORMAT_CLASSES);
  }, [fmt]);

  const doPrint = () => window.print();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5">
      <div className="flex">
        {OPTIONS.map((o) => (
          <button key={o.v} type="button" onClick={() => setFmt(o.v)}
            className={`h-9 px-2.5 text-xs font-medium rounded-md transition-colors ${fmt === o.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <Btn onClick={doPrint} className="h-9 px-3 text-sm">
        <Printer className="w-4 h-4 inline ml-1" />طباعة
      </Btn>
    </div>
  );
}
