import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { call, createTeacher, signInWithLink, type Person } from "./helpers";
import { makeReceiver } from "./push";

const PUBLIC_KEY = "BAlC8WGJJ97ul3Kuet85phrlxLlLHYIvqVIujZmh2J_9c7rOphKuGmrBr8cXUH0AgfMCK5BFMrJy70vdH4zNabE";
const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql)
    .bind(...args)
    .first<{ n: number }>())!.n;

const newEndpoint = () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
const subscribeBody = async (endpoint = newEndpoint()) => {
  const r = await makeReceiver();
  return { endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
};
const subscribe = (p: { cookie: string }, body: unknown) =>
  call("/api/push/subscribe", { method: "POST", cookie: p.cookie, body });
const check = (p: { cookie: string }, endpoint: string) =>
  call("/api/push/check", { method: "POST", cookie: p.cookie, body: { endpoint } });
const unsubscribe = (p: { cookie: string }, endpoint: string) =>
  call("/api/push/unsubscribe", { method: "POST", cookie: p.cookie, body: { endpoint } });
const rowsOf = (endpoint: string) =>
  count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", endpoint);

describe("saving push subscriptions", () => {
  it("reports push as on with the public key", async () => {
    const t = await createTeacher();
    const res = await call("/api/push/status", { cookie: t.cookie });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ enabled: true, publicKey: PUBLIC_KEY });
  });

  it("saves this device, checks it, and removes it", async () => {
    const t = await createTeacher();
    const body = await subscribeBody();
    expect((await subscribe(t, body)).json).toEqual({ ok: true });
    expect((await check(t, body.endpoint)).json).toEqual({ subscribed: true });
    expect((await unsubscribe(t, body.endpoint)).json).toEqual({ ok: true });
    expect((await check(t, body.endpoint)).json).toEqual({ subscribed: false });
    expect(await rowsOf(body.endpoint)).toBe(0);
  });

  it("refuses endpoints that are not a push service", async () => {
    const t = await createTeacher();
    const good = await subscribeBody();
    const bad = [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://u@fcm.googleapis.com/x",
    ];
    for (const endpoint of bad) {
      const res = await subscribe(t, { ...good, endpoint });
      expect(res.status, endpoint).toBe(400);
      expect(await rowsOf(endpoint), endpoint).toBe(0);
    }
    const ep = newEndpoint();
    const short = (await makeReceiver()).p256dh.slice(0, 40);
    expect((await subscribe(t, { endpoint: ep, keys: { ...good.keys, p256dh: short } })).status).toBe(400);
    const wrongAuth = (await makeReceiver()).p256dh; // 65 bytes, not 16
    expect((await subscribe(t, { endpoint: ep, keys: { ...good.keys, auth: wrongAuth } })).status).toBe(400);
    const notPoint = Buffer.from(new Uint8Array(65).fill(7)).toString("base64url"); // does not start with 0x04
    expect((await subscribe(t, { endpoint: ep, keys: { ...good.keys, p256dh: notPoint } })).status).toBe(400);
    expect(await rowsOf(ep)).toBe(0);
  });

  it("accepts the known push service hosts", async () => {
    const t = await createTeacher();
    for (const host of [
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
      "wns2-par02p.notify.windows.com",
    ]) {
      const res = await subscribe(t, await subscribeBody(`https://${host}/x/${crypto.randomUUID()}`));
      expect(res.status, host).toBe(200);
    }
  });

  it("moves an address to the person who subscribed last", async () => {
    const a = await createTeacher();
    const b = await createTeacher();
    const body = await subscribeBody();
    await subscribe(a, body);
    await subscribe(b, body);
    expect(await rowsOf(body.endpoint)).toBe(1);
    const row = await env.DB.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?")
      .bind(body.endpoint)
      .first<{ user_id: string }>();
    expect(row!.user_id).toBe(b.userId);
    expect((await check(a, body.endpoint)).json).toEqual({ subscribed: false });
    expect((await check(b, body.endpoint)).json).toEqual({ subscribed: true });
  });

  it("keeps one address per signed in browser: a new one replaces the old, other browsers keep theirs", async () => {
    const t = await createTeacher();
    const other: Person = { ...t, cookie: await signInWithLink(t.email) };
    const first = await subscribeBody();
    const second = await subscribeBody();
    const elsewhere = await subscribeBody();
    await subscribe(t, first);
    await subscribe(other, elsewhere);
    await subscribe(t, second);
    expect(await rowsOf(first.endpoint)).toBe(0);
    expect(await rowsOf(second.endpoint)).toBe(1);
    expect(await rowsOf(elsewhere.endpoint)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", t.userId)).toBe(2);
  });

  it("is not this device any more after signing out", async () => {
    const t = await createTeacher();
    const body = await subscribeBody();
    await subscribe(t, body);
    expect((await call("/api/auth/sign-out", { method: "POST", cookie: t.cookie })).status).toBe(200);
    const again: Person = { ...t, cookie: await signInWithLink(t.email) };
    expect((await check(again, body.endpoint)).json).toEqual({ subscribed: false });
  });

  it("cannot remove someone else's subscription", async () => {
    const a = await createTeacher();
    const b = await createTeacher();
    const body = await subscribeBody();
    await subscribe(a, body);
    expect((await unsubscribe(b, body.endpoint)).status).toBe(200);
    expect(await rowsOf(body.endpoint)).toBe(1);
    expect((await check(a, body.endpoint)).json).toEqual({ subscribed: true });
  });

  it("is off, and refuses subscriptions, without keys", async () => {
    const t = await createTeacher();
    const off = { VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined };
    expect((await call("/api/push/status", { cookie: t.cookie, env: off })).json).toEqual({
      enabled: false,
      publicKey: null,
    });
    const res = await call("/api/push/subscribe", {
      method: "POST",
      cookie: t.cookie,
      env: off,
      body: await subscribeBody(),
    });
    expect(res.status).toBe(404);
  });
});
