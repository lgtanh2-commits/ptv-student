import { describe, expect, it, vi } from "vitest";

vi.mock("@/messages", () => ({ language: "en" }));

const { formatDayLong, formatDayShort, formatVnd, formatWeekdayShort, formatWhen } = await import("./format");
const { periodLabel } = await import("./invoices/period");

const NBSP = "\u00a0";
const breaks = (s: string) => (s.match(/ /g) ?? []).length;

describe("format in English", () => {
  it("holds the money, the date and the time together", () => {
    expect(formatVnd(250000)).toBe(`250.000${NBSP}VND`);
    const when = formatWhen("2026-10-18T04:49:00.000Z");
    expect(when).toMatch(/^18.Oct.2026, \d\d:\d\d$/);
    expect(when).toContain(`18${NBSP}Oct${NBSP}2026,`);
    expect(breaks(formatDayShort("2026-10-05"))).toBe(0);
    expect(breaks(formatDayLong("2026-10-05"))).toBe(0);
  });
  it("gives the weekday chip with no comma", () => {
    expect(formatWeekdayShort("2026-10-25")).toBe("Sun");
  });
  it("starts the month label with a capital letter", () => {
    expect(periodLabel("2026-10")).toBe(`October${NBSP}2026`);
  });
});
