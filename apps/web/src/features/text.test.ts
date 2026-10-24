import { describe, expect, it } from "vitest";
import { fill } from "./text";

describe("fill", () => {
  it("puts values into a message", () => {
    expect(fill("{n} students, page {page}", { n: 3, page: 1 })).toBe("3 students, page 1");
  });
  it("keeps a number together with the word after it, but not a text value", () => {
    expect(fill("{n} points", { n: 2 })).toBe("2 points");
    expect(fill("{n} điểm", { n: 2 })).toBe("2 điểm");
    expect(fill("From {when} on", { when: "5 Oct" })).toBe("From 5 Oct on");
  });
  it("leaves nothing behind for a missing value", () => {
    expect(fill("Hi {name}", {})).toBe("Hi ");
  });
});
