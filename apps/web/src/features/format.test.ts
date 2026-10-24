import { describe, expect, it } from "vitest";
import { language } from "@/messages";
import {
  formatDay,
  formatDayLong,
  formatDayShort,
  formatLocalDay,
  formatVnd,
  formatWeek,
  formatWeekdayShort,
  formatWhen,
} from "./format";
import { periodLabel } from "./invoices/period";

const NBSP = " ";
/** Normal (breaking) spaces left in a value. */
const breaks = (s: string) => (s.match(/ /g) ?? []).length;

describe("format", () => {
  it("shows VND without decimals, number and unit held together", () => {
    expect(formatVnd(250000)).toBe(`250.000${NBSP}VND`);
    expect(formatVnd(0)).toBe(`0${NBSP}VND`);
    expect(breaks(formatVnd(12500000))).toBe(0);
  });
  it("shows a day as written, with no time zone shift", () => {
    expect(formatDay("2026-10-01")).toBe("01/10/2026");
    expect(formatDay(null)).toBe("-");
  });
  it("shows a moment as the local date, not the UTC one", () => {
    // 18:30 UTC on 11 Oct is already 12 Oct in Vietnam.
    expect(formatLocalDay("2026-10-11T18:30:00.000Z", "Asia/Ho_Chi_Minh")).toBe("12/10/2026");
    expect(formatLocalDay("2026-10-11T18:30:00.000Z", "UTC")).toBe("11/10/2026");
    expect(formatLocalDay(null)).toBe("-");
  });
  it("never breaks inside a date; a date and a time may break between them", () => {
    const when = formatWhen("2026-10-18T04:49:00.000Z");
    expect(breaks(when)).toBeLessThanOrEqual(1);
    expect(when).toContain(NBSP);
    expect(formatWhen(null)).toBe("-");
  });
  it("keeps a day, a long day and a week whole", () => {
    expect(breaks(formatDayShort("2026-10-05"))).toBe(0);
    expect(breaks(formatDayLong("2026-10-05"))).toBe(0);
    // Only the " - " between the two ends of the range may break.
    expect(formatWeek("2026-10-05")).toMatch(/ - /);
    expect(breaks(formatWeek("2026-10-05"))).toBe(2);
  });
  it("gives a weekday chip with no comma or full stop", () => {
    const sunday = formatWeekdayShort("2026-10-25");
    expect(sunday).toBe(language === "en" ? "Sun" : "CN");
    expect(sunday).not.toMatch(/[,.]/);
    expect(formatWeekdayShort("2026-10-26")).not.toMatch(/[,.]/);
  });
  it("starts a month label with a capital letter", () => {
    const label = periodLabel("2026-10");
    expect(label[0]).toBe(label[0]!.toLocaleUpperCase());
    expect(label[0]).not.toBe(label[0]!.toLocaleLowerCase());
  });
});
