-- سعر الجملة للقطعة — يُستخدم في التسعير الجماعي وفي البيع بسعر الجملة.
-- Existing rows start at 0, which the UI reads as "لا يوجد سعر جملة" and falls
-- back to the retail price (sell_price) at POS.
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.parts.sell_price IS 'سعر البيع القطاعي';
COMMENT ON COLUMN public.parts.wholesale_price IS 'سعر البيع بالجملة — 0 يعني غير محدد';
