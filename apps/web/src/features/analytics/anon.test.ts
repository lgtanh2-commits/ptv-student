import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = /^[A-Za-z0-9-]{8,64}$/;

/** A fresh copy of the module, as on a new page load. */
const load = async () => {
  vi.resetModules();
  return import("./anon");
};

function memoryStorage(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
  };
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 }))));
afterEach(() => vi.unstubAllGlobals());

describe("anonymousId", () => {
  it("makes a random id once and keeps it in lms.anon, across calls and page loads", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const first = (await load()).anonymousId();
    expect(first).toMatch(ID);
    expect(storage.data.get("lms.anon")).toBe(first);

    const again = await load();
    expect(again.anonymousId()).toBe(first);
    expect(again.anonymousId()).toBe(first);
  });

  it("replaces a stored value that is not a valid id", async () => {
    const storage = memoryStorage({ "lms.anon": "bad id <x>" });
    vi.stubGlobal("localStorage", storage);
    const id = (await load()).anonymousId();
    expect(id).toMatch(ID);
    expect(id).not.toBe("bad id <x>");
    expect(storage.data.get("lms.anon")).toBe(id);
  });

  it("still gives one id for the whole page load when storage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    const m = await load();
    const id = m.anonymousId();
    expect(id).toMatch(ID);
    expect(m.anonymousId()).toBe(id);
  });

  it("two browsers get different ids", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const a = (await load()).anonymousId();
    vi.stubGlobal("localStorage", memoryStorage());
    const b = (await load()).anonymousId();
    expect(a).not.toBe(b);
  });
});

describe("sendEvent", () => {
  it("posts the event to our own API, so it outlives a page change", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const m = await load();
    const body = {
      event: "Sign Up Clicked",
      anonymousId: m.anonymousId(),
      button: "email",
      place: "hero",
    } as const;
    m.sendEvent(body);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/events");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);
    expect((init?.headers as Record<string, string>)["x-lms-client"]).toBe("web");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("never throws, whether the request fails or fetch itself throws", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const m = await load();
    const body = { event: "Welcome Viewed", anonymousId: m.anonymousId() } as const;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(() => m.sendEvent(body)).not.toThrow();
    vi.stubGlobal("fetch", () => {
      throw new Error("no fetch");
    });
    expect(() => m.sendEvent(body)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // a rejected promise left unhandled would fail the run
  });
});

describe("referrerOrigin", () => {
  it("keeps only the origin of the page the visitor came from", async () => {
    const { referrerOrigin } = await load();
    expect(referrerOrigin("https://www.google.com/search?q=private")).toBe("https://www.google.com");
    expect(referrerOrigin("")).toBeUndefined();
    expect(referrerOrigin("nonsense")).toBeUndefined();
    expect(referrerOrigin(`https://${"a".repeat(120)}.com/`)).toBeUndefined();
  });
});
