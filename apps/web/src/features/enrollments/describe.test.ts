import type { EnrollResult } from "@lms/shared";
import { describe, expect, it } from "vitest";
import { describeEnroll } from "./describe";

const words = {
  resultAdded: "{n} added",
  resultAlready: "{n} already in the course",
  resultFull: "{n} could not join because the course is full",
  resultMissing: "{n} could not be found",
};
const res = (...r: EnrollResult["results"][number]["result"][]): EnrollResult => ({
  results: r.map((result, i) => ({ studentId: String(i), result })),
  enrolled: r.filter((x) => x === "enrolled").length,
});

/** Numbers are held to their word with a no-break space; compare as plain text. */
const plain = (s: string) => s.replaceAll("\u00a0", " ");

describe("describeEnroll", () => {
  it("says only what happened", () => {
    expect(plain(describeEnroll(res("enrolled", "enrolled", "enrolled"), words))).toBe("3 added");
    expect(plain(describeEnroll(res("already_enrolled"), words))).toBe("1 already in the course");
  });
  it("joins the parts in a clear order", () => {
    expect(
      plain(describeEnroll(res("enrolled", "full", "full", "already_enrolled", "not_found"), words)),
    ).toBe(
      "1 added, 1 already in the course, 2 could not join because the course is full, 1 could not be found",
    );
  });
});
