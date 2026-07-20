
-- 1) customers: split ALL policy into read/insert (authenticated) + update/delete (admin)
DROP POLICY IF EXISTS customers_auth_all ON public.customers;
CREATE POLICY customers_auth_read ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY customers_auth_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY customers_admin_update ON public.customers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY customers_admin_delete ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) sale_items: same treatment — sellers may add/read items; only admin may edit/delete after the fact
DROP POLICY IF EXISTS sale_items_auth_all ON public.sale_items;
CREATE POLICY sale_items_auth_read ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY sale_items_auth_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sale_items_admin_update ON public.sale_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY sale_items_admin_delete ON public.sale_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Revoke EXECUTE on trigger functions from public/anon/authenticated.
--    Triggers still fire (they run with the table owner's rights); no client should call them via RPC.
REVOKE ALL ON FUNCTION public.apply_sale_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_sale_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_purchase_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_purchase_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 4) has_role and bootstrap_first_admin remain callable by authenticated (needed by policies / first-run bootstrap).
--    Explicitly revoke from anon to keep them off the public API surface.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;
