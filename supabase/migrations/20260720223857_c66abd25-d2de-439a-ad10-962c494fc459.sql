
DROP POLICY IF EXISTS customers_auth_insert ON public.customers;
CREATE POLICY customers_auth_insert ON public.customers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS sale_items_auth_insert ON public.sale_items;
CREATE POLICY sale_items_auth_insert ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
