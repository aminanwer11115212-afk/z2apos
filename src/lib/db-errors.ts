/**
 * Postgres/PostgREST errors → Arabic messages the shop staff can act on.
 * Without this, a foreign-key violation reaches the user as
 * `update or delete on table "parts" violates foreign key constraint …`.
 */

type DbError = { code?: string; message?: string; details?: string; hint?: string };

const CODES: Record<string, string> = {
  "23503": "لا يمكن الحذف: العنصر مرتبط بفواتير أو حركات مسجّلة.",
  "23505": "القيمة مكرّرة — يوجد سجل بنفس الكود.",
  "23514": "قيمة غير مقبولة (تحقّق من الأرقام المدخلة).",
  "23502": "حقل مطلوب تُرك فارغاً.",
  "22003": "الرقم كبير جداً.",
  "22P02": "صيغة رقم أو تاريخ غير صحيحة.",
  "42501": "لا تملك صلاحية تنفيذ هذه العملية.",
  PGRST301: "انتهت الجلسة، سجّل الدخول من جديد.",
};

export function dbErrorMessage(e: unknown, fallback = "تعذّر تنفيذ العملية"): string {
  const err = e as DbError | null;
  if (!err) return fallback;
  if (err.code && CODES[err.code]) return CODES[err.code];
  // RLS denials surface as a plain 401/403 message rather than a code.
  if (err.message?.includes("row-level security")) return CODES["42501"];
  return err.message || fallback;
}

/** Throws a clean Error so mutations' `onError` can show it directly. */
export function throwDbError(e: unknown, fallback?: string): never {
  throw new Error(dbErrorMessage(e, fallback));
}
