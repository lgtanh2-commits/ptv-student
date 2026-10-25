import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { call, mixpanelFake, randomIp } from "./helpers";

const ON = { MIXPANEL_TOKEN: "test-token" };
const OFF = { MIXPANEL_TOKEN: undefined };
const ANON = "0b7c2f4e-9a1d-4c3b-8e5f-6a7b8c9d0e1f";

interface TrackedEvent {
  event: string;
  properties: Record<string, unknown>;
}

const tracked = (): TrackedEvent[] =>
  mixpanelFake.sent.filter((s) => s.path === "/track").flatMap((s) => s.body as TrackedEvent[]);

const send = (body: unknown, o: { ip?: string; env?: typeof ON | typeof OFF } = {}) =>
  call("/api/events", { method: "POST", body, env: o.env ?? ON, ip: o.ip });

beforeEach(() => {
  mixpanelFake.sent = [];
  mixpanelFake.status = 200;
});

describe("POST /api/events (welcome page)", () => {
  it("forwards a welcome view with the anonymous id, the referrer's host and the language", async () => {
    const res = await call("/api/events", {
      method: "POST",
      env: ON,
      lang: "vi",
      body: { event: "Welcome Viewed", anonymousId: ANON, referrer: "https://www.google.com/search?q=x" },
    });
    expect(res.status).toBe(204);
    expect(res.json).toBeNull();

    const events = tracked();
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe("Welcome Viewed");
    expect(events[0]!.properties).toEqual({
      token: "test-token",
      distinct_id: ANON,
      $device_id: ANON,
      referrer: "www.google.com",
      language: "vi",
      time: expect.any(Number),
    });
    expect(mixpanelFake.sent.every((s) => s.path === "/track")).toBe(true);
  });

  it("forwards a welcome view without a referrer, and drops one that is not an address", async () => {
    expect((await send({ event: "Welcome Viewed", anonymousId: ANON })).status).toBe(204);
    expect((await send({ event: "Welcome Viewed", anonymousId: ANON, referrer: "not a url" })).status).toBe(
      204,
    );
    for (const e of tracked()) expect(e.properties).not.toHaveProperty("referrer");
    expect(tracked()).toHaveLength(2);
  });

  it("forwards a sign-up click with its button and place", async () => {
    const res = await send({
      event: "Sign Up Clicked",
      anonymousId: ANON,
      button: "google",
      place: "bottom",
    });
    expect(res.status).toBe(204);
    const events = tracked();
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe("Sign Up Clicked");
    expect(events[0]!.properties).toEqual({
      token: "test-token",
      distinct_id: ANON,
      $device_id: ANON,
      button: "google",
      place: "bottom",
      language: "en",
      time: expect.any(Number),
    });
  });

  it.each([
    ["an unknown event", { event: "Signed Up", anonymousId: ANON }],
    ["an extra property", { event: "Welcome Viewed", anonymousId: ANON, email: "a@b.c" }],
    [
      "an extra property on a click",
      { event: "Sign Up Clicked", anonymousId: ANON, button: "email", place: "top", name: "x" },
    ],
    ["a property of the other event", { event: "Welcome Viewed", anonymousId: ANON, button: "email" }],
    ["an unknown button", { event: "Sign Up Clicked", anonymousId: ANON, button: "facebook", place: "top" }],
    ["an unknown place", { event: "Sign Up Clicked", anonymousId: ANON, button: "email", place: "side" }],
    ["a missing id", { event: "Welcome Viewed" }],
    ["a short id", { event: "Welcome Viewed", anonymousId: "abc" }],
    ["an oversize id", { event: "Welcome Viewed", anonymousId: "a".repeat(65) }],
    ["an id with other characters", { event: "Welcome Viewed", anonymousId: "abc def <script>" }],
    [
      "an oversize referrer",
      { event: "Welcome Viewed", anonymousId: ANON, referrer: `https://x.test/${"a".repeat(100)}` },
    ],
    ["a list", [{ event: "Welcome Viewed", anonymousId: ANON }]],
  ])("refuses %s (400) and forwards nothing", async (_, body) => {
    const res = await send(body);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_FAILED");
    expect(mixpanelFake.sent).toEqual([]);
  });

  it("needs the app's own header, like every other request that changes something", async () => {
    const res = await call("/api/events", {
      method: "POST",
      env: ON,
      noClientHeader: true,
      body: { event: "Welcome Viewed", anonymousId: ANON },
    });
    expect(res.status).toBe(403);
    expect(mixpanelFake.sent).toEqual([]);
  });

  it("allows 120 events an hour from one address, then answers 429", async () => {
    const ip = randomIp();
    const body = { event: "Welcome Viewed", anonymousId: ANON };
    for (let i = 0; i < 120; i++) expect((await send(body, { ip, env: OFF })).status).toBe(204);
    const limited = await send(body, { ip });
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("RATE_LIMITED");
    expect(mixpanelFake.sent).toEqual([]);
    // The counter is per address (hashed, never the address itself), and another address is not affected.
    const keys = await env.DB.prepare("SELECT key FROM rate_limits WHERE key LIKE 'events:ip:%'").all<{
      key: string;
    }>();
    expect(keys.results.some((r) => r.key.includes(ip))).toBe(false);
    expect((await send(body)).status).toBe(204);
  });

  it("forwards nothing when no token is set, and still answers 204", async () => {
    expect((await send({ event: "Welcome Viewed", anonymousId: ANON }, { env: OFF })).status).toBe(204);
    expect(
      (
        await send(
          { event: "Sign Up Clicked", anonymousId: ANON, button: "email", place: "hero" },
          { env: OFF },
        )
      ).status,
    ).toBe(204);
    expect(mixpanelFake.sent).toEqual([]);
  });

  it("still answers 204 when Mixpanel fails", async () => {
    mixpanelFake.status = 500;
    expect((await send({ event: "Welcome Viewed", anonymousId: ANON })).status).toBe(204);
  });
});
