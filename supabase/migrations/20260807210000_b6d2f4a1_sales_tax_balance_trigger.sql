
-- شبكة أمان لإصلاح الضريبة.
--
-- الهجرة 20260807120000 أضافت `sales.tax_amount` *و* حدّثت مشغّل الرصيد.
-- لكن الهجرة 20260807202457 أُنشئت لاحقاً لإضافة العمود وحده، وهو ما يدل على
-- أن العمود لم يكن موجوداً في قاعدة البيانات المباشرة حينها — أي أن هجرتي
-- ربما لم تُطبَّق، فيبقى المشغّل بلا وعي بالضريبة.
--
-- بدون المشغّل يصبح العمود بلا أثر، ويعود الخلل: عند تسديد فاتورة بالكامل
-- تكون paid شاملة الضريبة بينما المستحق يُحسب بدونها، فينشأ رصيد دائن وهمي
-- للعميل بمقدار الضريبة.
--
-- كل ما هنا خامل التكرار (idempotent): إعادة تشغيله بعد 20260807120000 بلا أثر.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- توحيد الدقة مع بقية الأعمدة المالية: الهجرة 20260807202457 تنشئ العمود بنوع
-- NUMERIC بلا دقة محدّدة، فإن كانت هي التي طُبِّقت يُضبط النوع هنا.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'tax_amount'
      AND (numeric_precision IS DISTINCT FROM 14 OR numeric_scale IS DISTINCT FROM 2)
  ) THEN
    ALTER TABLE public.sales ALTER COLUMN tax_amount TYPE NUMERIC(14,2);
  END IF;
END $$;

-- إدخال الضريبة في حساب المستحق.
CREATE OR REPLACE FUNCTION public.apply_sale_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_due NUMERIC := 0; new_due NUMERIC := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_due := COALESCE(OLD.total,0) - COALESCE(OLD.discount,0) + COALESCE(OLD.tax_amount,0) - COALESCE(OLD.paid,0);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_due := COALESCE(NEW.total,0) - COALESCE(NEW.discount,0) + COALESCE(NEW.tax_amount,0) - COALESCE(NEW.paid,0);
  END IF;

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

REVOKE ALL ON FUNCTION public.apply_sale_balance() FROM PUBLIC, anon, authenticated;

-- التأكد من ارتباط المشغّل بالجدول (لا يعيد CREATE OR REPLACE إنشاءه).
DROP TRIGGER IF EXISTS trg_sales_balance ON public.sales;
CREATE TRIGGER trg_sales_balance
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_balance();
