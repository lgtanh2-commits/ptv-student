import { localeOf } from "@lms/shared";
import { language } from "@/messages";
import { NBSP } from "./text";

const DATE_FIELDS = new Set(["weekday", "day", "month", "year", "era"]);

/**
 * Formats a moment so that a date never breaks inside and a time never breaks inside.
 * Only the space between a date and a time stays a normal one, so a line may break there.
 */
function unbreakable(format: Intl.DateTimeFormat, date: Date): string {
  const parts = format.formatToParts(date);
  const kind = (i: number, step: number): "date" | "time" | undefined => {
    for (let j = i + step; j >= 0 && j < parts.length; j += step) {
      const type = parts[j]!.type;
      if (type !== "literal") return DATE_FIELDS.has(type) ? "date" : "time";
    }
    return undefined;
  };
  return parts
    .map((p, i) => {
      if (p.type !== "literal") return p.value.replace(/ /g, NBSP);
      const before = kind(i, -1);
      const after = kind(i, 1);
      return before && after && before !== after ? p.value : p.value.replace(/ /g, NBSP);
    })
    .join("");
}

/** Money is a whole number of VND. Shown with thousands separators and no decimals. */
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)}${NBSP}VND`;
}

/** "2026-10-01" shown as a date. Uses the date as written, with no time zone shift. */
export function formatDay(isoDate: string | null): string {
  if (!isoDate) return "-";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// ------------------------------------------------------------------ calendar days

function utc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-10-05" moved by whole days. Works on the calendar, so months and years roll over. */
export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as "YYYY-MM-DD" on this computer's clock. */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The Monday of the week that holds this day. */
export function startOfWeek(date: string): string {
  const weekday = (utc(date).getUTCDay() + 6) % 7; // Monday is 0
  return addDays(date, -weekday);
}

/** "Mon 5 Oct" */
export function formatDayShort(date: string): string {
  return unbreakable(
    new Intl.DateTimeFormat(localeOf(language), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    utc(date),
  );
}

/** "Mon" ("CN" for Sunday in Vietnamese): the weekday alone, with no comma or full stop. */
export function formatWeekdayShort(date: string): string {
  return new Intl.DateTimeFormat(localeOf(language), { weekday: "short", timeZone: "UTC" })
    .format(utc(date))
    .replace(/[,.]/g, "")
    .trim()
    .replace(/ /g, NBSP);
}

/** "Monday 5 October 2026" */
export function formatDayLong(date: string): string {
  return unbreakable(
    new Intl.DateTimeFormat(localeOf(language), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    utc(date),
  );
}

/** "5 Oct - 11 Oct 2026" for the week that starts on `monday`. */
export function formatWeek(monday: string): string {
  const fmt = (d: string, year: boolean) =>
    unbreakable(
      new Intl.DateTimeFormat(localeOf(language), {
        day: "numeric",
        month: "short",
        year: year ? "numeric" : undefined,
        timeZone: "UTC",
      }),
      utc(d),
    );
  return `${fmt(monday, false)} - ${fmt(addDays(monday, 6), true)}`;
}

/** The site of a link, to show people where it leads: "https://docs.google.com/x" gives "docs.google.com". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A moment (UTC) shown as the date on this computer's clock, in the page language: "12/10/2026". */
export function formatLocalDay(iso: string | null, timeZone?: string): string {
  if (!iso) return "-";
  return unbreakable(
    new Intl.DateTimeFormat(localeOf(language), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone,
    }),
    new Date(iso),
  );
}

/** A moment (UTC) shown as a date and time on this computer's clock: "5 Oct 2026, 18:30". */
export function formatWhen(iso: string | null): string {
  if (!iso) return "-";
  return unbreakable(
    new Intl.DateTimeFormat(localeOf(language), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    new Date(iso),
  );
}
