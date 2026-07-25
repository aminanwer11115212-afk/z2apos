
-- Accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'wallet')),
  code TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_auth_read" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounts_admin_write" ON public.accounts FOR INSERT UPDATE DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_idx ON public.accounts(code) WHERE code IS NOT NULL;

-- Account transactions
CREATE TABLE IF NOT EXISTS public.account_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer_in', 'transfer_out')),
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
CREATE POLICY "account_transactions_auth_read" ON public.account_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "account_transactions_auth_insert" ON public.account_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR created_by IS NULL));
CREATE POLICY "account_transactions_admin_update" ON public.account_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "account_transactions_admin_delete" ON public.account_transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS account_transactions_account_idx ON public.account_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_transactions_created_idx ON public.account_transactions(created_at DESC);

-- Default accounts
INSERT INTO public.accounts (id, name, type, code, is_default) VALUES
  ('cash-default', 'الصندوق النقدي', 'cash', 'cash', true),
  ('okash', 'OKash', 'bank', 'okash', false),
  ('bankak', 'بنكك', 'bank', 'bankak', false),
  ('fawry', 'فوري', 'bank', 'fawry', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: resolve account by stored account_name or default account type
CREATE OR REPLACE FUNCTION public.resolve_account(account_name TEXT, method TEXT)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.accounts
  WHERE (account_name IS NOT NULL AND name = account_name)
     OR (account_name IS NULL AND (
       (method = 'cash' AND type = 'cash') OR
       (method IN ('bank','transfer','wallet') AND type = 'bank')
     ))
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;
$$;

-- Record a transaction and update balance atomically
CREATE OR REPLACE FUNCTION public.record_account_transaction(
  p_account_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL,
  p_related_table TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_delta NUMERIC;
BEGIN
  IF p_type IN ('income', 'transfer_in') THEN v_delta := p_amount;
  ELSIF p_type IN ('expense', 'transfer_out') THEN v_delta := -p_amount;
  ELSE v_delta := 0;
  END IF;

  INSERT INTO public.account_transactions (
    account_id, type, amount, reference, notes, related_id, related_table, created_by
  ) VALUES (
    p_account_id, p_type, p_amount, p_reference, p_notes, p_related_id, p_related_table, p_created_by
  ) RETURNING id INTO v_id;

  UPDATE public.accounts SET balance = balance + v_delta WHERE id = p_account_id;
  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_account_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;

-- Transfer between accounts
CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(out_id UUID, in_id UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  out_tx UUID;
  in_tx UUID;
BEGIN
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Cannot transfer to same account'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  out_tx := public.record_account_transaction(p_from_account_id, 'transfer_out', p_amount, p_reference, p_notes, p_to_account_id, 'accounts', p_created_by);
  in_tx := public.record_account_transaction(p_to_account_id, 'transfer_in', p_amount, p_reference, p_notes, p_from_account_id, 'accounts', p_created_by);
  RETURN QUERY SELECT out_tx, in_tx;
END; $$;

REVOKE EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

-- Update apply_payment trigger to also record account transactions
DROP TRIGGER IF EXISTS trg_payments_apply ON public.payments;
DROP FUNCTION IF EXISTS public.apply_payment();

CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC;
  acc_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.amount;

    IF NEW.direction = 'in' THEN
      IF NEW.customer_id IS NOT NULL THEN UPDATE public.customers SET balance = balance - delta WHERE id = NEW.customer_id; END IF;
      IF NEW.sale_id IS NOT NULL THEN UPDATE public.sales SET paid = paid + delta WHERE id = NEW.sale_id; END IF;
      acc_id := public.resolve_account(NEW.account_name, NEW.method);
      IF acc_id IS NOT NULL THEN
        PERFORM public.record_account_transaction(acc_id, 'income', delta, NEW.notes, NULL, NEW.id, 'payments', NEW.created_by);
      END IF;
    ELSIF NEW.direction = 'out' THEN
      IF NEW.supplier_id IS NOT NULL THEN UPDATE public.suppliers SET balance = balance - delta WHERE id = NEW.supplier_id; END IF;
      IF NEW.purchase_id IS NOT NULL THEN UPDATE public.purchases SET paid = paid + delta WHERE id = NEW.purchase_id; END IF;
      acc_id := public.resolve_account(NEW.account_name, NEW.method);
      IF acc_id IS NOT NULL THEN
        PERFORM public.record_account_transaction(acc_id, 'expense', delta, NEW.notes, NULL, NEW.id, 'payments', NEW.created_by);
      END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    delta := OLD.amount;

    IF OLD.direction = 'in' THEN
      IF OLD.customer_id IS NOT NULL THEN UPDATE public.customers SET balance = balance + delta WHERE id = OLD.customer_id; END IF;
      IF OLD.sale_id IS NOT NULL THEN UPDATE public.sales SET paid = paid - delta WHERE id = OLD.sale_id; END IF;
      acc_id := public.resolve_account(OLD.account_name, OLD.method);
      IF acc_id IS NOT NULL THEN
        UPDATE public.account_transactions SET type = 'expense' WHERE related_id = OLD.id AND related_table = 'payments' AND account_id = acc_id AND type = 'income';
        UPDATE public.accounts SET balance = balance - delta WHERE id = acc_id;
      END IF;
    ELSIF OLD.direction = 'out' THEN
      IF OLD.supplier_id IS NOT NULL THEN UPDATE public.suppliers SET balance = balance + delta WHERE id = OLD.supplier_id; END IF;
      IF OLD.purchase_id IS NOT NULL THEN UPDATE public.purchases SET paid = paid - delta WHERE id = OLD.purchase_id; END IF;
      acc_id := public.resolve_account(OLD.account_name, OLD.method);