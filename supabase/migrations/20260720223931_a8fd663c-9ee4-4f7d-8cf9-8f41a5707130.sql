
DROP POLICY IF EXISTS sales_auth_insert ON public.sales;
CREATE POLICY sales_auth_insert ON public.sales FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
ALTER TABLE public.sales ALTER COLUMN created_by SET NOT NULL;
