
-- الضريبة: كانت تُحسب في المتصفح من الإعدادات الحالية وتُضاف إلى `paid`،
-- بينما مشغّل الرصيد لا يعرف سوى total/discount/paid — فيصير
-- due = total - discount - (net + tax) = -tax، أي رصيد دائن وهمي للعميل
-- بمقدار الضريبة عند كل فاتورة مسدَّدة بالكامل.
--
-- الحل: تخزين مبلغ الضريبة على الفاتورة نفسها وإدخاله في حساب المستحق.
-- تخزينها أيضاً يمنع تغيّر الفواتير القديمة أثرياً عند تعديل نسبة الضريبة لاحقاً.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

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

-- CREATE OR REPLACE يحتفظ بصلاحيات الدالة، لكن نعيد التأكيد صراحةً:
-- المشغّل يعمل بصلاحيات مالك الجدول، ولا يجوز استدعاء الدالة عبر RPC.
REVOKE ALL ON FUNCTION public.apply_sale_balance() FROM PUBLIC, anon, authenticated;
