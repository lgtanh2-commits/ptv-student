import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const app = createApp();
const post = (headers: Record<string, string>, path = "/api/health") =>
  app.request(`https://lms.test${path}`, { method: "POST", headers }, env);

// /api/health has no POST route, so a request that passes the CSRF check gets 404
// (or 405). A request that fails the check gets 403 ORIGIN_NOT_ALLOWED.
describe("CSRF protection on unsafe methods", () => {
  it("blocks a request without the client header", async () => {
    const res = await post({});
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("blocks a request from another site (Sec-Fetch-Site: cross-site)", async () => {
    const res = await post({ "x-lms-client": "web", "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
  });

  it("blocks a request with a different Origin", async () => {
    const res = await post({ "x-lms-client": "web", origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("blocks an Origin that is not a valid URL", async () => {
    const res = await post({ "x-lms-client": "web", origin: "not a url" });
    expect(res.status).toBe(403);
  });

  it("lets a same-origin request with the client header through", async () => {
    const res = await post({
      "x-lms-client": "web",
      origin: "https://lms.test",
      "sec-fetch-site": "same-origin",
    });
    expect(res.status).not.toBe(403);
  });

  it("does not check safe methods", async () => {
    const res = await app.request(
      "https://lms.test/api/health",
      { headers: { "sec-fetch-site": "cross-site" } },
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("the one exception: Telegram's own address", () => {
  const webhook = (headers: Record<string, string>) =>
    app.request(
      "https://lms.test/api/telegram/webhook",
      { method: "POST", headers, body: JSON.stringify({}) },
      env,
    );

  it("answers Telegram even with none of the checks above: no client header, no origin, cross-site", async () => {
    // This is what a real call from Telegram looks like: no cookie, no Origin, no client header.
    const res = await webhook({ "x-telegram-bot-api-secret-token": "test-webhook-secret" });
    expect(res.status).toBe(200);
  });

  it("still checks its own secret: a browser cannot use the exemption to reach it either", async () => {
    const res = await webhook({});
    expect(res.status).toBe(404); // wrong (missing) secret, not treated as a CSRF matter at all
  });

  it("is the only address exempted: the app's other Telegram routes still need the usual checks", async () => {
    for (const path of ["/api/telegram/link-code", "/api/telegram/unlink"]) {
      const res = await post({ "x-telegram-bot-api-secret-token": "test-webhook-secret" }, path);
      expect(res.status, path).toBe(403);
    }
  });
});
