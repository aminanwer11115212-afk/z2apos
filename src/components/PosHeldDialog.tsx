import { HeldSale } from "@/lib/pos";
import { formatSDG } from "@/lib/auth";
import { Modal, Btn } from "@/components/ui-kit";
import { Trash2 } from "lucide-react";

type PosHeldDialogProps = {
  open: boolean;
  onClose: () => void;
  held: HeldSale[];
  onResume: (h: HeldSale) => void;
  onDrop: (id: string) => void;
};

export function PosHeldDialog({ open, onClose, held, onResume, onDrop }: PosHeldDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={`فواتير معلّقة (${held.length})`}>
      {held.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد فواتير معلّقة</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {held.map((h) => {
            const t = h.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
            return (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 border rounded-lg p-2.5 bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {h.lines.length} صنف · {formatSDG(t)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.savedAt).toLocaleString("ar-SD", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Btn onClick={() => onResume(h)} className="h-8 text-xs px-3">
                    استعادة
                  </Btn>
                  <button
                    onClick={() => onDrop(h.id)}
                    className="w-8 h-8 rounded border text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
