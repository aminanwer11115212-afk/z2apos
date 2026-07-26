
-- Accounts ledger (fixed: valid policy syntax, UUID-safe seeds, idempotent)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','wallet')),
  code TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_auth_read" ON public.accounts;
CREATE POLICY "accounts_auth_read" ON public.accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accounts_admin_write" ON public.accounts;
DROP POLICY IF EXISTS "accounts_admin_insert" ON public.accounts;
CREATE POLICY "accounts_admin_insert" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "accounts_admin_update" ON public.accounts;
CREATE POLICY "accounts_admin_update" ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "accounts_admin_delete" ON public.accounts;
CREATE POLICY "accounts_admin_delete" ON public.accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_idx ON public.accounts(code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.account_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer_in','transfer_out')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  notes TEXT,
  related_id UUID,
  related_table TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.account_transactions TO authenticated;
GRANT ALL ON public.account_transactions TO service_role;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_transactions_auth_read" ON public.account_transactions;
CREATE POLICY "account_transactions_auth_read" ON public.account_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "account_transactions_auth_insert" ON public.account_transactions;
CREATE POLICY "account_transactions_auth_insert" ON public.account_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR created_by IS NULL));
DROP POLICY IF EXISTS "account_transactions_admin_update" ON public.account_transactions;
CREATE POLICY "account_transactions_admin_update" ON public.account_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "account_transactions_admin_delete" ON public.account_transactions;
CREATE POLICY "account_transactions_admin_delete" ON public.account_transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS account_transactions_account_idx ON public.account_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_transactions_created_idx ON public.account_transactions(created_at DESC);

-- Seed default accounts (types match src/lib/settings.ts defaults)
INSERT INTO public.accounts (name, type, code, is_default) VALUES
  ('الصندوق النقدي', 'cash', 'cash', true),
  ('OKash', 'wallet', 'okash', false),
  ('بنكك', 'bank', 'bankak', false),
  ('فوري', 'wallet', 'fawry', false)
ON CONFLICT (code) WHERE code IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.resolve_account(account_name TEXT, method TEXT)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.accounts
  WHERE (account_name IS NOT NULL AND name = account_name)
     OR (account_name IS NULL AND (
          (method = 'cash' AND type = 'cash') OR
          (method IN ('bank','transfer') AND type = 'bank') OR
          (method = 'wallet' AND type = 'wallet')
        ))
  ORDER BY is_default DESC, created_at ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.record_account_transaction(
  p_account_id UUID, p_type TEXT, p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL, p_related_table TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_delta NUMERIC;
BEGIN
  v_delta := CASE WHEN p_type IN ('income','transfer_in') THEN p_amount WHEN p_type IN ('expense','transfer_out') THEN -p_amount ELSE 0 END;
  INSERT INTO public.account_transactions (account_id, type, amount, reference, notes, related_id, related_table, created_by)
  VALUES (p_account_id, p_type, p_amount, p_reference, p_notes, p_related_id, p_related_table, p_created_by)
  RETURNING id INTO v_id;
  UPDATE public.accounts SET balance = balance + v_delta WHERE id = p_account_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_account_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
  p_from_account_id UUID, p_to_account_id UUID, p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(out_id UUID, in_id UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE out_tx UUID; in_tx UUID;
BEGIN
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Cannot transfer to same account'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  out_tx := public.record_account_transaction(p_from_account_id, 'transfer_out', p_amount, p_reference, p_notes, p_to_account_id, 'accounts', p_created_by);
  in_tx := public.record_account_transaction(p_to_account_id, 'transfer_in', p_amount, p_reference, p_notes, p_from_account_id, 'accounts', p_created_by);
  RETURN QUERY SELECT out_tx, in_tx;
END; $$;
REVOKE EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

DROP TRIGGER IF EXISTS trg_payments_apply ON public.payments;
DROP FUNCTION IF EXISTS public.apply_payment();

-- apply_payment (fixed): when a payment is linked to a sale/purchase, the
-- customer/supplier balance is adjusted by trg_sales_balance/trg_purchases_balance
-- through the paid update — adjusting it here too double-counted the amount.
CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta NUMERIC; acc_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.amount;
    IF NEW.direction = 'in' THEN
      IF NEW.sale_id IS NOT NULL THEN
        UPDATE public.sales SET paid = paid + delta WHERE id = NEW.sale_id;
      ELSIF NEW.customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = balance - delta WHERE id = NEW.customer_id;
      END IF;
      acc_id := public.resolve_account(NEW.account_name, NEW.method);
      IF acc_id IS NOT NULL THEN PERFORM public.record_account_transaction(acc_id, 'income', delta, NEW.notes, NULL, NEW.id, 'payments', NEW.created_by); END IF;
    ELSIF NEW.direction = 'out' THEN
      IF NEW.purchase_id IS NOT NULL THEN
        UPDATE public.purchases SET paid = paid + delta WHERE id = NEW.purchase_id;
      ELSIF NEW.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET balance = balance - delta WHERE id = NEW.supplier_id;
      END IF;
      acc_id := public.resolve_account(NEW.account_name, NEW.method);
      IF acc_id IS NOT NULL THEN PERFORM public.record_account_transaction(acc_id, 'expense', delta, NEW.notes, NULL, NEW.id, 'payments', NEW.created_by); END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    delta := OLD.amount;
    IF OLD.direction = 'in' THEN
      IF OLD.sale_id IS NOT NULL THEN
        UPDATE public.sales SET paid = paid - delta WHERE id = OLD.sale_id;
      ELSIF OLD.customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = balance + delta WHERE id = OLD.customer_id;
      END IF;
      DELETE FROM public.account_transactions WHERE related_id = OLD.id AND related_table = 'payments' AND type = 'income';
    ELSIF OLD.direction = 'out' THEN
      IF OLD.purchase_id IS NOT NULL THEN
        UPDATE public.purchases SET paid = paid - delta WHERE id = OLD.purchase_id;
      ELSIF OLD.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET balance = balance + delta WHERE id = OLD.supplier_id;
      END IF;
      DELETE FROM public.account_transactions WHERE related_id = OLD.id AND related_table = 'payments' AND type = 'expense';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_payment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_payments_apply
  AFTER INSERT OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment();

-- Record initial income/expense when a sale/purchase is created with payment
CREATE OR REPLACE FUNCTION public.record_sale_income()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc_id UUID;
BEGIN
  IF NEW.paid > 0 THEN
    acc_id := public.resolve_account(NEW.account_name, NEW.payment_method);
    IF acc_id IS NOT NULL THEN
      PERFORM public.record_account_transaction(acc_id, 'income', NEW.paid, NULL, NEW.notes, NEW.id, 'sales', NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_sale_income() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sales_income ON public.sales;
CREATE TRIGGER trg_sales_income
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.record_sale_income();

CREATE OR REPLACE FUNCTION public.record_purchase_expense()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc_id UUID;
BEGIN
  IF NEW.paid > 0 THEN
    acc_id := public.resolve_account(NEW.account_name, NEW.payment_method);
    IF acc_id IS NOT NULL THEN
      PERFORM public.record_account_transaction(acc_id, 'expense', NEW.paid, NULL, NEW.notes, NEW.id, 'purchases', NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_purchase_expense() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchases_expense ON public.purchases;
CREATE TRIGGER trg_purchases_expense
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.record_purchase_expense();
