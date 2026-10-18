import { describe, expect, it } from "vitest";
import { formatDay, formatLocalDay, formatVnd } from "./format";

describe("format", () => {
  it("shows VND without decimals", () => {
    expect(formatVnd(150000)).toMatch(/^150[.  ]?000 VND$/);
    expect(formatVnd(0)).toBe("0 VND");
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
});
