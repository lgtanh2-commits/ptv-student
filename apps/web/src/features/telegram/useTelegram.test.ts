import { afterEach, describe, expect, it, vi } from "vitest";
import { useTelegramLink } from "./useTelegram";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTelegramLink", () => {
  it("keeps checking after one check fails, and stops once linked", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // onMounted outside a component
    const statuses = [new Error("offline"), { linked: true }];
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/telegram/link-code")) {
        return Response.json({ deepLink: "https://t.me/bot?start=x", expiresInMinutes: 10 });
      }
      const next = statuses.shift();
      if (next instanceof Error) throw next;
      return Response.json(next);
    });
    vi.stubGlobal("fetch", fetchFn);

    const t = useTelegramLink();
    await t.requestLink();
    expect(t.deepLink.value).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2500); // this check fails
    await vi.advanceTimersByTimeAsync(2500); // this one sees the link
    expect(t.status.value?.linked).toBe(true);
    expect(t.deepLink.value).toBeNull();
    expect(t.error.value).toBeNull();

    const calls = fetchFn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn.mock.calls.length).toBe(calls);
  });
});
