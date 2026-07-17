/**
 * Eastern-Time (America/New_York) date helpers.
 *
 * Routely is a Florida operation, so every report/rollup must bucket by the ET
 * calendar day even though the server + Postgres store timestamps in UTC. These
 * helpers pin all day math to ET regardless of the runtime/browser timezone and
 * are DST-safe (the UTC↔ET offset is recomputed at each instant).
 */

export const ET_TZ = "America/New_York";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for an instant, in Eastern Time. */
export function etDayKey(instant: Date | string | number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: ET_TZ });
}

/** ms to add to a UTC instant to get the ET wall-clock reading (DST-safe). */
function etOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return asUTC - instant.getTime();
}

/** UTC instant for 00:00:00 ET of the given ET calendar day ("YYYY-MM-DD"). */
export function etDayStartUtc(etYmd: string): Date {
  const [Y, M, D] = etYmd.split("-").map(Number);
  const guess = Date.UTC(Y, M - 1, D, 0, 0, 0);
  const off = etOffsetMs(new Date(guess));
  return new Date(guess - off);
}

/** UTC instant for 23:59:59.999 ET of the given ET calendar day. */
export function etDayEndUtc(etYmd: string): Date {
  const start = etDayStartUtc(etYmd);
  // Step safely into the next ET day, snap to its start, back off 1ms.
  const nextKey = etDayKey(new Date(start.getTime() + 26 * 3_600_000));
  return new Date(etDayStartUtc(nextKey).getTime() - 1);
}

/** Today's ET calendar day, "YYYY-MM-DD". */
export function etToday(): string {
  return etDayKey(new Date());
}

/** Shift an ET day key by n days (DST-safe via a midday anchor). */
export function etAddDays(etYmd: string, n: number): string {
  const anchor = etDayStartUtc(etYmd).getTime() + n * 86_400_000 + 12 * 3_600_000;
  return etDayKey(new Date(anchor));
}

/** ET calendar Y-M-D of a Date's *local* fields, as "YYYY-MM-DD" — i.e. the day
 *  the user actually clicked in a local-time date picker, reinterpreted as ET. */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
