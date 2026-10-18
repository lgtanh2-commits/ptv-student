import { describe, expect, it } from "vitest";
import { SERVER_TEXT } from "./server-text";
import { translate } from "./translate";

// Vite's file import (this package has no Node types, so no node:fs here).
declare global {
  interface ImportMeta {
    glob(
      patterns: string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}

// Code a text can come from: no tests, not this generated table, and not the api's list of the table ids
// each email and notification may hold (it only copies ids, so an id must still be found where it is made).
const sources = Object.values(
  import.meta.glob(
    [
      "../../../../apps/api/src/**/*.ts",
      "../**/*.ts",
      "!**/*.test.ts",
      "!./server-text.ts",
      "!../../../../apps/api/src/lib/outbound-text.ts",
      "!../../../../apps/api/src/feedback/telegram.ts",
    ],
    { query: "?raw", import: "default", eager: true },
  ),
);

/** The fixed parts of an id, around its `{…}` placeholders (SQL builds some texts with `||`). */
const literalParts = (id: string) => id.split(/\{[^{}]*\}/).filter((p) => p !== "");

describe("SERVER_TEXT", () => {
  it("has entries, and the source files are read", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources.some((text) => text.includes("'New homework: '"))).toBe(true);
    expect(sources.some((text) => text.includes("Please sign in to continue."))).toBe(true);
    expect(sources.some((text) => text.includes("export const SERVER_TEXT"))).toBe(false);
    expect(SERVER_TEXT.length).toBeGreaterThan(170);
  });

  it("has unique ids", () => {
    const ids = SERVER_TEXT.map((e) => e.id);
    expect(ids.length - new Set(ids).size).toBe(0);
  });

  it("has no stale ids: the fixed parts of every id are in one source file", () => {
    const stale = SERVER_TEXT.map((e) => e.id).filter(
      (id) => !sources.some((text) => literalParts(id).every((part) => text.includes(part))),
    );
    expect(stale).toEqual([]);
  });

  it("keeps the placeholders of the id in every language", () => {
    const holders = (s: string) => (s.match(/\{[^{}]*\}/g) ?? []).sort();
    const bad = SERVER_TEXT.filter(
      (e) =>
        JSON.stringify(holders(e.en)) !== JSON.stringify(holders(e.id)) ||
        JSON.stringify(holders(e.vi)) !== JSON.stringify(holders(e.id)),
    ).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it("translates a long input made of the pieces of a multi-placeholder id quickly", () => {
    const multi = SERVER_TEXT.filter((e) => (e.id.match(/\{[^{}]*\}/g) ?? []).length >= 2);
    expect(multi.length).toBeGreaterThan(0);
    for (const e of multi) {
      for (const sep of ["", "x"]) {
        const piece = literalParts(e.id).join(sep) + sep;
        // Repeated pieces, then a character that stops the final fixed part from matching.
        const input = piece.repeat(Math.ceil(1900 / piece.length)).slice(0, 1900) + "\u0000";
        for (const lang of ["vi", "en"] as const) {
          const start = Date.now();
          translate(input, lang);
          expect(Date.now() - start, e.id).toBeLessThan(50);
        }
      }
    }
  });
});
