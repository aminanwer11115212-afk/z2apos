import { useState } from "react";
import { Modal, Field, Input, Btn, useDialog } from "@/components/ui-kit";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function usePosCustomerDialog(onCreated: (id: string) => void) {
  const dialog = useDialog();
  const [form, setForm] = useState({ name: "", phone: "" });
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("الاسم مطلوب");
      const { data, error } = await supabase
        .from("customers")
        .insert({ name: form.name.trim(), phone: form.phone.trim() || null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("تمت إضافة العميل");
      onCreated(id);
      setForm({ name: "", phone: "" });
      dialog.hide();
      qc.invalidateQueries({ queryKey: ["customers-lite-phone"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    open: dialog.show,
    close: dialog.hide,
    isOpen: dialog.open,
    form,
    setForm,
    save,
  };
}

export function PosCustomerDialog({
  isOpen,
  onClose,
  form,
  setForm,
  save,
}: {
  isOpen: boolean;
  onClose: () => void;
  form: { name: string; phone: string };
  setForm: (f: { name: string; phone: string }) => void;
  save: { mutate: () => void; isPending: boolean };
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="عميل جديد"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            حفظ
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="الاسم *">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="الهاتف">
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
            className="text-right"
          />
        </Field>
      </div>
    </Modal>
  );
}
