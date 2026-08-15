/**
 * Local-calendar date helpers.
 *
 * `toISOString().slice(0, 10)` is UTC, so in Sudan (UTC+2) it labels every
 * moment before 02:00 with the previous day — the "اليوم" preset silently
 * reported yesterday, and evening sales fell into tomorrow's bucket. Everything
 * user-facing here is anchored to the *local* calendar instead.
 */

/** `YYYY-MM-DD` for a date, in the browser's timezone. */
export function localISODate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local calendar day of a stored timestamp — never slice the raw UTC string. */
export function dayKey(timestamp: string | number | Date): string {
  return localISODate(new Date(timestamp));
}

/** Midnight today, local. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Inclusive `YYYY-MM-DD` range → the UTC instants to hand Postgres. */
export function rangeToInstants(from: string, to: string): { start: string; end: string } {
  return {
    start: new Date(`${from}T00:00:00`).toISOString(),
    end: new Date(`${to}T23:59:59.999`).toISOString(),
  };
}
