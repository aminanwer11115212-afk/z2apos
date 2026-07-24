
-- Add payment_method columns
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS account_name TEXT;

-- Payments ledger
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  account_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_auth_read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_auth_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR created_by IS NULL));
CREATE POLICY "payments_admin_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "payments_admin_delete" ON public.payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: adjust balances (customer/supplier) and increment sale/purchase paid
CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.amount;
    IF NEW.direction = 'in' THEN
      IF NEW.customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = balance - delta WHERE id = NEW.customer_id;
      END IF;
      IF NEW.sale_id IS NOT NULL THEN
        UPDATE public.sales SET paid = paid + delta WHERE id = NEW.sale_id;
      END IF;
    ELSIF NEW.direction = 'out' THEN
      IF NEW.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET balance = balance - delta WHERE id = NEW.supplier_id;
      END IF;
      IF NEW.purchase_id IS NOT NULL THEN
        UPDATE public.purchases SET paid = paid + delta WHERE id = NEW.purchase_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    delta := OLD.amount;
    IF OLD.direction = 'in' THEN
      IF OLD.customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = balance + delta WHERE id = OLD.customer_id;
      END IF;
      IF OLD.sale_id IS NOT NULL THEN
        UPDATE public.sales SET paid = paid - delta WHERE id = OLD.sale_id;
      END IF;
    ELSIF OLD.direction = 'out' THEN
      IF OLD.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET balance = balance + delta WHERE id = OLD.supplier_id;
      END IF;
      IF OLD.purchase_id IS NOT NULL THEN
        UPDATE public.purchases SET paid = paid - delta WHERE id = OLD.purchase_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_payment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_payments_apply
  AFTER INSERT OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment();

CREATE INDEX IF NOT EXISTS payments_customer_idx ON public.payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_supplier_idx ON public.payments(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_sale_idx ON public.payments(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_purchase_idx ON public.payments(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_created_idx ON public.payments(created_at DESC);
