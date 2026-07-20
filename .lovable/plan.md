
# نظام 2A — إدارة قطع غيار السيارات

**من تطوير:** أمين أنور أحمد
**نمط الاستخدام:** Online (ويب + PWA للهاتف والحاسوب)
**اللغة:** عربي RTL فقط
**العملة:** جنيه سوداني (SDG)

---

## 1. البنية التقنية

- TanStack Start + React + Tailwind (الموجود).
- تفعيل **Lovable Cloud** للقاعدة والمصادقة.
- **PWA** عبر manifest + أيقونات (بدون Service Worker — المستخدم طلب Online فقط، لا وضع offline). قابل للتثبيت على الهاتف والحاسوب.
- واجهة **Mobile-first** بسيطة جدًا، مع تكيّف كامل للحاسوب.
- خط عربي واضح (Cairo أو Tajawal) + `dir="rtl"` عالمي.

---

## 2. المصادقة والأدوار

- تسجيل دخول بالبريد + كلمة مرور.
- جدول `profiles` مربوط بـ `auth.users` (اسم كامل).
- جدول `user_roles` منفصل + enum `app_role`: `admin` / `seller`.
  - `admin`: كل شيء (إدارة القطع، المشتريات، المستخدمين، التقارير).
  - `seller`: بيع فقط + عرض المخزون.
- دالة `has_role()` بـ SECURITY DEFINER.
- أول مستخدم يُسجّل يصبح admin تلقائيًا (trigger).

---

## 3. قاعدة البيانات (Lovable Cloud)

جداول في `public` مع GRANT + RLS + policies تعتمد على `has_role`:

| الجدول | الحقول الأساسية |
|---|---|
| `profiles` | id, user_id, full_name |
| `user_roles` | id, user_id, role |
| `parts` | id, code (SKU), name, category, car_model, cost_price, sell_price, quantity, min_quantity, notes |
| `customers` | id, name, phone, address, balance |
| `suppliers` | id, name, phone, address, balance |
| `sales` (فواتير بيع) | id, invoice_no, customer_id, total, paid, discount, created_by, created_at |
| `sale_items` | id, sale_id, part_id, qty, unit_price, subtotal |
| `purchases` (فواتير شراء) | id, invoice_no, supplier_id, total, paid, created_by, created_at |
| `purchase_items` | id, purchase_id, part_id, qty, unit_cost, subtotal |

**Triggers:**
- عند إدراج `sale_items`: خصم `parts.quantity` وزيادة `customers.balance` بالمتبقي.
- عند إدراج `purchase_items`: زيادة `parts.quantity` وزيادة `suppliers.balance` بالمتبقي.
- عند حذف/تعديل: عكس الأثر.

---

## 4. الصفحات (واجهة بسيطة جدًا)

```
/auth                → تسجيل دخول
/                    → لوحة رئيسية (اختصارات كبيرة: بيع سريع، مخزون، تقارير)
/parts               → قائمة قطع الغيار + بحث + إضافة/تعديل
/sales               → قائمة فواتير البيع
/sales/new           → فاتورة بيع سريعة (POS-style)
/purchases           → قائمة فواتير الشراء
/purchases/new       → إدخال بضاعة جديدة
/customers           → العملاء
/suppliers           → الموردون
/reports             → تقارير (مبيعات يومية، مخزون منخفض، أرصدة)
/users               → إدارة المستخدمين (admin فقط)
```

**مبادئ الواجهة:**
- شريط سفلي (bottom nav) على الهاتف بـ 4-5 أيقونات كبيرة.
- Sidebar على الحاسوب.
- بحث فوري في كل الجداول (بادئة).
- شاشة البيع: بحث عن القطعة بالكود/الاسم → إضافة → إدخال الكمية → حفظ. أقل عدد نقرات ممكن.
- ألوان هادئة، تباين عالي، خطوط كبيرة، لا زخرفة.

---

## 5. PWA

- `public/manifest.webmanifest` باسم "2A" + `display: standalone` + `theme_color` + `background_color` + `lang: ar` + `dir: rtl`.
- أيقونات: 192×192 و 512×512 (مولّدة).
- روابط `<link rel="manifest">` و `<link rel="apple-touch-icon">` و `theme-color` في `__root.tsx`.
- **بدون Service Worker** (لأن التطبيق Online فقط) — يتماشى مع قواعد المنصة.

---

## 6. الهوية

- شعار نصي بسيط: **2A** مع سطر صغير "من تطوير أمين أنور أحمد" في شاشة الدخول والفوتر.
- Title: `2A — إدارة قطع غيار السيارات`.

---

## 7. خطة التنفيذ (بالترتيب)

1. تفعيل Lovable Cloud.
2. Migration واحدة: enum + كل الجداول + GRANTs + RLS + policies + triggers + trigger أول-مستخدم-admin.
3. إعداد RTL + خط Cairo في `styles.css` + `__root.tsx` (meta + manifest + theme).
4. توليد أيقونات PWA + manifest.
5. صفحة `/auth` (دخول + تسجيل).
6. Layout محمي `_authenticated` + Bottom nav (موبايل) + Sidebar (ديسكتوب).
7. صفحة `/` لوحة رئيسية.
8. وحدة **قطع الغيار** (قائمة + إضافة/تعديل/حذف + بحث).
9. وحدة **الموردين** ثم **المشتريات** (فاتورة شراء + بنود).
10. وحدة **العملاء** ثم **المبيعات** (فاتورة بيع سريعة).
11. صفحة **التقارير** (مبيعات اليوم، أقل من الحد الأدنى، أرصدة عملاء/موردين).
12. صفحة **إدارة المستخدمين** (admin فقط).
13. اختبار سريع للـ PWA (قابلية التثبيت) + مراجعة نهائية.

---

## 8. خارج النطاق (المرحلة الأولى)

- الطباعة A4 (يمكن إضافتها لاحقًا).
- الباركود.
- المرتجعات.
- تعدد الفروع/المخازن.
- Offline mode.

---

**بعد موافقتك أبدأ بالخطوة 1 (تفعيل Cloud) ثم Migration، وسأنتظر صور واجهات Access التي ذكرتها لأستلهم منها التفاصيل البصرية قبل بناء الشاشات.**
