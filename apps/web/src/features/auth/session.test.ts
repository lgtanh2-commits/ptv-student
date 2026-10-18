import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@/api/client", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const { useSession } = await import("./session");

/** A local storage that keeps what is written (this page was loaded in Vietnamese: nothing stored). */
function stubStorage(writable = true) {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (writable) kept.set(k, v);
    },
  });
  return kept;
}

function signedInAs(language: "vi" | "en") {
  api.mockResolvedValue({ user: { id: "u1", name: "Lan", language }, memberships: [] });
}

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  vi.unstubAllGlobals();
  api.mockReset();
});

describe("session language", () => {
  it("stores the account's language and asks for a fresh page, without reloading itself", async () => {
    const kept = stubStorage();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload, replace: reload });
    signedInAs("en");
    expect(await useSession().load(true)).toBe(true);
    expect(kept.get("lms.lang")).toBe("en");
    expect(reload).not.toHaveBeenCalled();
  });

  it("needs nothing when the account's language is the page's", async () => {
    stubStorage();
    signedInAs("vi");
    expect(await useSession().load(true)).toBe(false);
  });

  it("needs nothing when this browser cannot store the language (no endless reloads)", async () => {
    stubStorage(false);
    signedInAs("en");
    expect(await useSession().load(true)).toBe(false);
  });

  it("does not ask again once loaded", async () => {
    stubStorage();
    signedInAs("en");
    const session = useSession();
    expect(await session.load()).toBe(true);
    expect(await session.load()).toBe(false); // already loaded, not asked again
  });
});
