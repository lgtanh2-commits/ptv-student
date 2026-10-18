import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/messages/en";
import { vi as viMessages } from "@/messages/vi";
import { rememberLanguage, storedLanguage } from "./language";

afterEach(() => vi.unstubAllGlobals());

function stubStorage(value: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => value, setItem: vi.fn() });
}

describe("storedLanguage", () => {
  it("returns en when en is stored", () => {
    stubStorage("en");
    expect(storedLanguage()).toBe("en");
  });

  it("returns vi when vi is stored", () => {
    stubStorage("vi");
    expect(storedLanguage()).toBe("vi");
  });

  it.each(["x", "__proto__", "../", "EN", "en ", "a".repeat(10_000), null])(
    "treats %j as missing and uses vi",
    (value) => {
      stubStorage(value);
      expect(storedLanguage()).toBe("vi");
    },
  );

  it("uses vi when local storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(storedLanguage()).toBe("vi");
  });

  it("uses vi when there is no local storage at all", () => {
    expect(storedLanguage()).toBe("vi");
  });
});

describe("rememberLanguage", () => {
  it("stores the language under lms.lang", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    rememberLanguage("en");
    expect(setItem).toHaveBeenCalledWith("lms.lang", "en");
  });

  it("ignores a failing write", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(() => rememberLanguage("en")).not.toThrow();
  });
});

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keysOf(v, `${prefix}.${k}`));
}

describe("catalogs", () => {
  it("vi and en have identical key sets", () => {
    expect(keysOf(viMessages).sort()).toEqual(keysOf(en).sort());
  });
});
