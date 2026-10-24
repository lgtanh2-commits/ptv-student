import { localeOf } from "@lms/shared";
import { today } from "@/features/format";
import { language } from "@/messages";

/** The month of today as "2026-09", on this computer's clock. */
export const currentPeriod = (now: Date = new Date()): string => today(now).slice(0, 7);

/** "2026-09" moved by whole months. The year rolls over. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}

/** "September 2026", starting with a capital letter in either language. */
export const periodLabel = (period: string): string => {
  const locale = localeOf(language);
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${period}-01T00:00:00Z`),
  );
  return (label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)).replace(/ /g, "\u00a0");
};

/** "2026-09" as "09/2026". */
export const periodShort = (period: string): string => {
  const [y, m] = period.split("-");
  return `${m}/${y}`;
};
