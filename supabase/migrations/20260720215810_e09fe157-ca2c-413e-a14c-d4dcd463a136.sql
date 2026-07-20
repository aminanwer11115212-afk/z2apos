
-- ===== ENUM: أدوار =====
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

-- ===== دالة تحديث updated_at =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===== profiles =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== user_roles =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== has_role =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ===== bootstrap: أول مستخدم يصبح admin =====
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID; v_role public.app_role;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_uid, COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_uid), ''))
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
      v_role := 'admin';
    ELSE
      v_role := 'seller';
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, v_role);
  END IF;

  RETURN (SELECT role FROM public.user_roles WHERE user_id = v_uid ORDER BY role LIMIT 1);
END; $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

-- ===== سياسات profiles =====
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_upsert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== سياسات user_roles =====
CREATE POLICY "user_roles_read_all_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== parts =====
CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  car_model TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parts_auth_read" ON public.parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "parts_admin_write" ON public.parts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_parts_updated BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== customers =====
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_auth_all" ON public.customers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== suppliers =====
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_auth_read" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_admin_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== sequences رقم الفاتورة =====
CREATE SEQUENCE public.sales_invoice_seq START 1;
CREATE SEQUENCE public.purchases_invoice_seq START 1;

-- ===== sales =====
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no INTEGER NOT NULL UNIQUE DEFAULT nextval('public.sales_invoice_seq'),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_auth_read" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_auth_insert" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "sales_admin_update" ON public.sales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales_admin_delete" ON public.sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== sale_items =====
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  qty NUMERIC(14,2) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_auth_all" ON public.sale_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ===== purchases =====
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no INTEGER NOT NULL UNIQUE DEFAULT nextval('public.purchases_invoice_seq'),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_auth_read" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchases_admin_all" ON public.purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== purchase_items =====
CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  qty NUMERIC(14,2) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items_auth_read" ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_items_admin_write" ON public.purchase_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== محفزات: تعديل المخزون =====
CREATE OR REPLACE FUNCTION public.apply_sale_item_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.parts SET quantity = quantity - NEW.qty WHERE id = NEW.part_id;
    UPDATE public.sales SET total = total + NEW.subtotal WHERE id = NEW.sale_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.parts SET quantity = quantity + OLD.qty WHERE id = OLD.part_id;
    UPDATE public.sales SET total = total - OLD.subtotal WHERE id = OLD.sale_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.parts SET quantity = quantity + OLD.qty - NEW.qty WHERE id = NEW.part_id;
    UPDATE public.sales SET total = total - OLD.subtotal + NEW.subtotal WHERE id = NEW.sale_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item_stock();

CREATE OR REPLACE FUNCTION public.apply_purchase_item_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.parts SET quantity = quantity + NEW.qty, cost_price = NEW.unit_cost WHERE id = NEW.part_id;
    UPDATE public.purchases SET total = total + NEW.subtotal WHERE id = NEW.purchase_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.parts SET quantity = quantity - OLD.qty WHERE id = OLD.part_id;
    UPDATE public.purchases SET total = total - OLD.subtotal WHERE id = OLD.purchase_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.parts SET quantity = quantity - OLD.qty + NEW.qty WHERE id = NEW.part_id;
    UPDATE public.purchases SET total = total - OLD.subtotal + NEW.subtotal WHERE id = NEW.purchase_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_purchase_items_stock
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_item_stock();

-- ===== محفزات: أرصدة العملاء والموردين =====
CREATE OR REPLACE FUNCTION public.apply_sale_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_due NUMERIC := 0; new_due NUMERIC := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_due := COALESCE(OLD.total,0) - COALESCE(OLD.discount,0) - COALESCE(OLD.paid,0); END IF;
  IF TG_OP <> 'DELETE' THEN new_due := COALESCE(NEW.total,0) - COALESCE(NEW.discount,0) - COALESCE(NEW.paid,0); END IF;

  IF TG_OP = 'DELETE' AND OLD.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = balance - old_due WHERE id = OLD.customer_id;
  ELSIF TG_OP = 'INSERT' AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = balance + new_due WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id THEN
      IF NEW.customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = balance - old_due + new_due WHERE id = NEW.customer_id;
      END IF;
    ELSE
      IF OLD.customer_id IS NOT NULL THEN UPDATE public.customers SET balance = balance - old_due WHERE id = OLD.customer_id; END IF;
      IF NEW.customer_id IS NOT NULL THEN UPDATE public.customers SET balance = balance + new_due WHERE id = NEW.customer_id; END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_sales_balance
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_balance();

CREATE OR REPLACE FUNCTION public.apply_purchase_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_due NUMERIC := 0; new_due NUMERIC := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_due := COALESCE(OLD.total,0) - COALESCE(OLD.paid,0); END IF;
  IF TG_OP <> 'DELETE' THEN new_due := COALESCE(NEW.total,0) - COALESCE(NEW.paid,0); END IF;

  IF TG_OP = 'DELETE' AND OLD.supplier_id IS NOT NULL THEN
    UPDATE public.suppliers SET balance = balance - old_due WHERE id = OLD.supplier_id;
  ELSIF TG_OP = 'INSERT' AND NEW.supplier_id IS NOT NULL THEN
    UPDATE public.suppliers SET balance = balance + new_due WHERE id = NEW.supplier_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.supplier_id IS NOT DISTINCT FROM NEW.supplier_id THEN
      IF NEW.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET balance = balance - old_due + new_due WHERE id = NEW.supplier_id;
      END IF;
    ELSE
      IF OLD.supplier_id IS NOT NULL THEN UPDATE public.suppliers SET balance = balance - old_due WHERE id = OLD.supplier_id; END IF;
      IF NEW.supplier_id IS NOT NULL THEN UPDATE public.suppliers SET balance = balance + new_due WHERE id = NEW.supplier_id; END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_purchases_balance
AFTER INSERT OR UPDATE OR DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_balance();
