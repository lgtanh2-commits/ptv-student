import { applyD1Migrations } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { env } from "cloudflare:workers";
import { ERROR_CODES, translate } from "@lms/shared";
import { describe, expect, it } from "vitest";
import { MAX_REQUEST_BYTES } from "../src/app";
import { ROUTE_ACCESS } from "../src/routes/access";
import { call, createTeacher, googleSignIn, latestToken, uniqueEmail, validCourse } from "./helpers";

const languageOf = async (email: string) =>
  (
    await env.DB.prepare("SELECT language FROM users WHERE email = ?")
      .bind(email)
      .first<{ language: string }>()
  )?.language;

const NAME_EN = "Please enter a name.";
const NAME_VI = translate(NAME_EN, "vi");
const SIGN_IN_EN = ERROR_CODES.UNAUTHENTICATED.message;
const SIGN_IN_VI = translate(SIGN_IN_EN, "vi");

describe("language: the migration", () => {
  it("keeps English for accounts made before it, and gives new accounts Vietnamese", async () => {
    // A database of its own, so the shared test database (already fully migrated) is not touched.
    const db = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
    const all = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
    await applyD1Migrations(
      db,
      all.filter((m) => m.name < "0021"),
    );
    await db
      .prepare(
        "INSERT INTO users (id, email, name, created_at, updated_at) VALUES ('old', 'old@example.com', 'Old', '2026-01-01', '2026-01-01')",
      )
      .run();
    await applyD1Migrations(db, all);
    const lang = (id: string) =>
      db.prepare("SELECT language FROM users WHERE id = ?").bind(id).first<{ language: string }>();
    expect((await lang("old"))?.language).toBe("en");

    await db
      .prepare(
        "INSERT INTO users (id, email, name, created_at, updated_at) VALUES ('new', 'new@example.com', 'New', '2026-01-01', '2026-01-01')",
      )
      .run();
    expect((await lang("new"))?.language).toBe("vi");
    // Only the two languages can be stored.
    await expect(db.prepare("UPDATE users SET language = 'fr' WHERE id = 'new'").run()).rejects.toThrow();
  });

  it("a teacher who signs up with no language sent gets Vietnamese", async () => {
    const t = await createTeacher("Teacher", { lang: null });
    expect(await languageOf(t.email)).toBe("vi");
    const me = await call("/api/me", { cookie: t.cookie });
    expect(me.json.user.language).toBe("vi");
  });
});

describe("language: GET /me and PUT /me/language", () => {
  it("shows the language and changes it", async () => {
    const t = await createTeacher("Teacher", { lang: "vi" });
    expect((await call("/api/me", { cookie: t.cookie })).json.user.language).toBe("vi");

    const put = await call("/api/me/language", {
      method: "PUT",
      cookie: t.cookie,
      body: { language: "en" },
    });
    expect(put.status).toBe(200);
    expect(put.json).toEqual({ language: "en" });
    expect((await call("/api/me", { cookie: t.cookie })).json.user.language).toBe("en");
    expect(await languageOf(t.email)).toBe("en");
  });

  it("refuses anything but vi or en", async () => {
    const t = await createTeacher();
    for (const language of ["fr", "__proto__", "EN", "", null, 1]) {
      const res = await call("/api/me/language", { method: "PUT", cookie: t.cookie, body: { language } });
      expect(res.status, String(language)).toBe(400);
    }
    expect(await languageOf(t.email)).toBe("en");
  });

  it("needs the client header (CSRF)", async () => {
    const t = await createTeacher();
    const res = await call("/api/me/language", {
      method: "PUT",
      cookie: t.cookie,
      body: { language: "vi" },
      noClientHeader: true,
    });
    expect(res.status).toBe(403);
    expect(await languageOf(t.email)).toBe("en");
  });

  it("needs a signed in person", async () => {
    const res = await call("/api/me/language", { method: "PUT", body: { language: "en" } });
    expect(res.status).toBe(401);
  });

  it("is listed in the route table", () => {
    expect(ROUTE_ACCESS["PUT /api/me/language"]).toBe("user");
  });
});

describe("language: errors", () => {
  it("are in the account's language, whatever the header says", async () => {
    expect(NAME_VI).not.toBe(NAME_EN);
    const t = await createTeacher("Teacher", { lang: "vi" });
    const res = await call("/api/courses", { method: "POST", cookie: t.cookie, body: {}, lang: "en" });
    expect(res.status).toBe(400);
    expect(res.json.error.fields.name).toBe(NAME_VI);
    expect(res.json.error.message).toBe(translate(ERROR_CODES.VALIDATION_FAILED.message, "vi"));

    const en = await createTeacher("Teacher", { lang: "en" });
    const res2 = await call("/api/courses", { method: "POST", cookie: en.cookie, body: {}, lang: "vi" });
    expect(res2.json.error.fields.name).toBe(NAME_EN);
  });

  it("translate the messages of checks across fields too", async () => {
    const t = await createTeacher("Teacher", { lang: "vi" });
    const res = await call("/api/courses", {
      method: "POST",
      cookie: t.cookie,
      body: validCourse({ startDate: "2026-05-01", endDate: "2026-04-01" }),
    });
    expect(res.status).toBe(400);
    expect(res.json.error.fields.endDate).toBe(
      translate("The end date cannot be before the start date.", "vi"),
    );
  });

  it("for a signed out person follow the header, and default to Vietnamese", async () => {
    expect(SIGN_IN_VI).not.toBe(SIGN_IN_EN);
    expect((await call("/api/me", { lang: "en" })).json.error.message).toBe(SIGN_IN_EN);
    expect((await call("/api/me", { lang: "vi" })).json.error.message).toBe(SIGN_IN_VI);
    expect((await call("/api/me", { lang: null })).json.error.message).toBe(SIGN_IN_VI);
    for (const junk of ["x".repeat(10_000), "__proto__", "../", "EN", "en-GB", "constructor"]) {
      const res = await call("/api/me", { lang: junk });
      expect(res.status).toBe(401);
      expect(res.json.error.message, junk.slice(0, 20)).toBe(SIGN_IN_VI);
    }
  });

  it("thrown before the account is read still get a language", async () => {
    const csrf = await call("/api/courses", { method: "POST", body: {}, noClientHeader: true, lang: "en" });
    expect(csrf.json.error.message).toBe(ERROR_CODES.ORIGIN_NOT_ALLOWED.message);
    const csrfVi = await call("/api/courses", { method: "POST", body: {}, noClientHeader: true, lang: null });
    expect(csrfVi.json.error.message).toBe(translate(ERROR_CODES.ORIGIN_NOT_ALLOWED.message, "vi"));

    const big = { name: "x".repeat(MAX_REQUEST_BYTES + 10) };
    const tooBig = await call("/api/auth/sign-up", { method: "POST", body: big, lang: null });
    expect(tooBig.status).toBe(413);
    expect(tooBig.json.error.message).toBe(translate(ERROR_CODES.TOO_LARGE.message, "vi"));

    const missing = await call("/api/nothing-here", { lang: null });
    expect(missing.status).toBe(404);
    expect(missing.json.error.message).toBe(translate(ERROR_CODES.NOT_FOUND.message, "vi"));
  });
});

describe("language: new accounts", () => {
  it("sign up takes the language of the request", async () => {
    const email = uniqueEmail("t");
    const up = await call("/api/auth/sign-up", { method: "POST", body: { name: "A", email }, lang: "en" });
    expect(up.status).toBe(202);
    expect(await languageOf(email)).toBe("en");

    const email2 = uniqueEmail("t");
    await call("/api/auth/sign-up", {
      method: "POST",
      body: { name: "A", email: email2 },
      lang: "__proto__",
    });
    expect(await languageOf(email2)).toBe("vi");
  });

  it("sign up for an address that has an account does not change its language", async () => {
    const t = await createTeacher("Teacher", { lang: "en" });
    await call("/api/auth/sign-up", { method: "POST", body: { name: "A", email: t.email }, lang: "vi" });
    expect(await languageOf(t.email)).toBe("en");
  });

  it("Google sign up takes ?lang= from the start, only when it is vi or en", async () => {
    const en = uniqueEmail("g");
    expect((await googleSignIn({ email: en, intent: "sign-up", lang: "en" })).location).toBe("/");
    expect(await languageOf(en)).toBe("en");

    const vi = uniqueEmail("g");
    await googleSignIn({ email: vi, intent: "sign-up", lang: "vi" });
    expect(await languageOf(vi)).toBe("vi");

    const junk = uniqueEmail("g");
    await googleSignIn({ email: junk, intent: "sign-up", lang: "xx" });
    expect(await languageOf(junk)).toBe("vi");

    const none = uniqueEmail("g");
    await googleSignIn({ email: none, intent: "sign-up" });
    expect(await languageOf(none)).toBe("vi");
  });

  it("an invite makes a new account in Vietnamese, and leaves an existing account alone", async () => {
    const teacher = await createTeacher("Teacher", { lang: "en" });
    const invite = (email: string) =>
      call("/api/invites", { method: "POST", cookie: teacher.cookie, body: { name: "Mai", email } });

    const kid = uniqueEmail("kid");
    await invite(kid);
    const accepted = await call("/api/invites/accept", {
      method: "POST",
      body: { token: await latestToken(kid, "invite") },
      lang: "en",
    });
    expect(accepted.status).toBe(200);
    expect(await languageOf(kid)).toBe("vi");

    const other = await createTeacher("Other", { lang: "en" });
    await invite(other.email);
    const again = await call("/api/invites/accept", {
      method: "POST",
      body: { token: await latestToken(other.email, "invite") },
      lang: "vi",
    });
    expect(again.status).toBe(200);
    expect(await languageOf(other.email)).toBe("en");
  });
});
