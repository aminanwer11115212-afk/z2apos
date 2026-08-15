-- إصلاح ازدواج خصم الدفعات من أرصدة العملاء والموردين.
--
-- الخلل: `apply_payment` كان — عند تسجيل دفعة مرتبطة بفاتورة — يخصم المبلغ من
-- رصيد العميل مباشرةً *و* يزيد `sales.paid`. وزيادة `paid` تُشغّل
-- `apply_sale_balance` الذي يعيد حساب المستحق ويخصم المبلغ مرة ثانية،
-- فينخفض رصيد العميل بضعف قيمة الدفعة (والأمر نفسه للمورد/فاتورة الشراء).
--
-- ويظهر الأثر بوضوح في كشف الحساب: مجموع الكشف (المحسوب من الفواتير والدفعات)
-- لا يساوي `customers.balance` المخزّن.
--
-- الإصلاح: حين تكون الدفعة مرتبطة بفاتورة تخص نفس الطرف، يُترك تعديل الرصيد
-- لمشغّل الفاتورة وحده. أما الدفعة على الحساب (بلا فاتورة) — أو المرتبطة
-- بفاتورة طرفها مختلف — فتُعدّل الرصيد مباشرةً كما كان.

CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta NUMERIC;
  v_sale_customer UUID;
  v_purchase_supplier UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.amount;

    IF NEW.direction = 'in' THEN
      IF NEW.sale_id IS NOT NULL THEN
        SELECT customer_id INTO v_sale_customer FROM public.sales WHERE id = NEW.sale_id;
        -- مشغّل المبيعات سيتكفّل بخصم المبلغ من رصيد عميل الفاتورة.
        UPDATE public.sales SET paid = paid + delta WHERE id = NEW.sale_id;
      END IF;
      IF NEW.customer_id IS NOT NULL
         AND (NEW.sale_id IS NULL OR v_sale_customer IS DISTINCT FROM NEW.customer_id) THEN
        UPDATE public.customers SET balance = balance - delta WHERE id = NEW.customer_id;
      END IF;

    ELSIF NEW.direction = 'out' THEN
      IF NEW.purchase_id IS NOT NULL THEN
        SELECT supplier_id INTO v_purchase_supplier FROM public.purchases WHERE id = NEW.purchase_id;
        UPDATE public.purchases SET paid = paid + delta WHERE id = NEW.purchase_id;
      END IF;
      IF NEW.supplier_id IS NOT NULL
         AND (NEW.purchase_id IS NULL OR v_purchase_supplier IS DISTINCT FROM NEW.supplier_id) THEN
        UPDATE public.suppliers SET balance = balance - delta WHERE id = NEW.supplier_id;
      END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    delta := OLD.amount;

    IF OLD.direction = 'in' THEN
      IF OLD.sale_id IS NOT NULL THEN
        SELECT customer_id INTO v_sale_customer FROM public.sales WHERE id = OLD.sale_id;
        UPDATE public.sales SET paid = paid - delta WHERE id = OLD.sale_id;
      END IF;
      IF OLD.customer_id IS NOT NULL
         AND (OLD.sale_id IS NULL OR v_sale_customer IS DISTINCT FROM OLD.customer_id) THEN
        UPDATE public.customers SET balance = balance + delta WHERE id = OLD.customer_id;
      END IF;

    ELSIF OLD.direction = 'out' THEN
      IF OLD.purchase_id IS NOT NULL THEN
        SELECT supplier_id INTO v_purchase_supplier FROM public.purchases WHERE id = OLD.purchase_id;
        UPDATE public.purchases SET paid = paid - delta WHERE id = OLD.purchase_id;
      END IF;
      IF OLD.supplier_id IS NOT NULL
         AND (OLD.purchase_id IS NULL OR v_purchase_supplier IS DISTINCT FROM OLD.supplier_id) THEN
        UPDATE public.suppliers SET balance = balance + delta WHERE id = OLD.supplier_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.apply_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payments_apply ON public.payments;
CREATE TRIGGER trg_payments_apply
  AFTER INSERT OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment();

-- ---------------------------------------------------------------------------
-- إعادة احتساب الأرصدة المتضرّرة من الازدواج السابق.
-- الرصيد مشتق بالكامل من الفواتير والدفعات (لا تُدخل الواجهة رصيداً افتتاحياً)،
-- لذا فإعادة الحساب من المصدر آمنة وقابلة للتكرار.
-- ---------------------------------------------------------------------------
WITH sale_due AS (
  SELECT customer_id,
         SUM(COALESCE(total,0) - COALESCE(discount,0) + COALESCE(tax_amount,0) - COALESCE(paid,0)) AS due
  FROM public.sales
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
), on_account AS (
  SELECT p.customer_id, SUM(p.amount) AS amt
  FROM public.payments p
  LEFT JOIN public.sales s ON s.id = p.sale_id
  WHERE p.direction = 'in'
    AND p.customer_id IS NOT NULL
    AND (p.sale_id IS NULL OR s.customer_id IS DISTINCT FROM p.customer_id)
  GROUP BY p.customer_id
)
UPDATE public.customers c
SET balance = COALESCE(sd.due, 0) - COALESCE(oa.amt, 0)
FROM public.customers x
LEFT JOIN sale_due sd ON sd.customer_id = x.id
LEFT JOIN on_account oa ON oa.customer_id = x.id
WHERE c.id = x.id
  AND c.balance IS DISTINCT FROM (COALESCE(sd.due, 0) - COALESCE(oa.amt, 0));

WITH purchase_due AS (
  SELECT supplier_id,
         SUM(COALESCE(total,0) - COALESCE(paid,0)) AS due
  FROM public.purchases
  WHERE supplier_id IS NOT NULL
  GROUP BY supplier_id
), on_account AS (
  SELECT p.supplier_id, SUM(p.amount) AS amt
  FROM public.payments p
  LEFT JOIN public.purchases pu ON pu.id = p.purchase_id
  WHERE p.direction = 'out'
    AND p.supplier_id IS NOT NULL
    AND (p.purchase_id IS NULL OR pu.supplier_id IS DISTINCT FROM p.supplier_id)
  GROUP BY p.supplier_id
)
UPDATE public.suppliers s
SET balance = COALESCE(pd.due, 0) - COALESCE(oa.amt, 0)
FROM public.suppliers x
LEFT JOIN purchase_due pd ON pd.supplier_id = x.id
LEFT JOIN on_account oa ON oa.supplier_id = x.id
WHERE s.id = x.id
  AND s.balance IS DISTINCT FROM (COALESCE(pd.due, 0) - COALESCE(oa.amt, 0));
