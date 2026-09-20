import { env } from "cloudflare:workers";
import { LIMITS } from "@lms/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { runNotificationJobs } from "../src/notifications/jobs";
import { call, createCourse, createTeacher, telegramFake, type Person } from "./helpers";
import { fullAnswers, joinedKid, mixed, publish, submit } from "./homework";

const setSql = (sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql)
    .bind(...args)
    .first<{ n: number }>())!.n;

const status = (p: Person) => call("/api/telegram/status", { cookie: p.cookie });
const requestCode = (p: Person) => call("/api/telegram/link-code", { method: "POST", cookie: p.cookie });
const unlink = (p: Person) => call("/api/telegram/unlink", { method: "POST", cookie: p.cookie });
const codeOf = (deepLink: string) => new URL(deepLink).searchParams.get("start")!;
/** `secret: null` means "send no header at all" (a plain `undefined` argument would fall back to the default). */
const webhook = (
  chatId: number | string,
  text: string | undefined,
  secret: string | null = "test-webhook-secret",
) =>
  call("/api/telegram/webhook", {
    method: "POST",
    headers: secret !== null ? { "x-telegram-bot-api-secret-token": secret } : {},
    body:
      text === undefined
        ? { message: { chat: { id: chatId } } }
        : { message: { chat: { id: chatId }, text } },
  });

/** Gets a fresh code for this person and "opens" it in Telegram from this chat. Returns the reply text. */
async function link(p: Person, chatId: number | string): Promise<string> {
  const code = await requestCode(p);
  expect(code.status, JSON.stringify(code.json)).toBe(200);
  const res = await webhook(chatId, `/start ${codeOf(code.json.deepLink)}`);
  expect(res.status).toBe(200);
  return telegramFake.asked.at(-1)!.text;
}

beforeEach(() => {
  telegramFake.asked = [];
  telegramFake.ok = true;
});

describe("linking a Telegram chat", () => {
  it("is off until linked, on after, and off again after unlinking", async () => {
    const t = await createTeacher();
    expect((await status(t)).json).toEqual({ enabled: true, linked: false });
    await link(t, 111);
    expect((await status(t)).json).toEqual({ enabled: true, linked: true });
    expect((await unlink(t)).status).toBe(200);
    expect((await status(t)).json).toEqual({ enabled: true, linked: false });
  });

  it("gives a t.me link to the right bot, good for the minutes in LIMITS, made of characters Telegram allows", async () => {
    const t = await createTeacher();
    const res = await requestCode(t);
    expect(res.json.expiresInMinutes).toBe(LIMITS.telegramLinkMinutes);
    const url = new URL(res.json.deepLink);
    expect(url.host).toBe("t.me");
    expect(url.pathname).toBe("/TestLmsBot");
    expect(codeOf(res.json.deepLink)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("replies to /start with a code, saying it worked", async () => {
    const t = await createTeacher();
    expect(await link(t, 111)).toMatch(/Linked/);
  });

  it("a code works once: the second try is told it is not valid any more", async () => {
    const t = await createTeacher();
    const res = await requestCode(t);
    const code = codeOf(res.json.deepLink);
    await webhook(111, `/start ${code}`);
    await webhook(222, `/start ${code}`);
    expect(telegramFake.asked[0]!.text).toMatch(/Linked/);
    expect(telegramFake.asked[1]!.text).toMatch(/not valid/);
    expect((await status(t)).json.linked).toBe(true); // the second try changed nothing
  });

  it("an expired code is refused the same way as one used up", async () => {
    const t = await createTeacher();
    const res = await requestCode(t);
    await setSql(
      "UPDATE telegram_link_codes SET expires_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      t.userId,
    );
    await webhook(111, `/start ${codeOf(res.json.deepLink)}`);
    expect(telegramFake.asked[0]!.text).toMatch(/not valid/);
    expect((await status(t)).json.linked).toBe(false);
  });

  it("moves a chat to whoever links it next, so it never belongs to two people", async () => {
    const a = await createTeacher("Lan Tran");
    const b = await createTeacher("Mai Pham");
    await link(a, 999);
    expect((await status(a)).json.linked).toBe(true);
    await link(b, 999);
    expect((await status(a)).json.linked).toBe(false); // a lost it
    expect((await status(b)).json.linked).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM telegram_links WHERE chat_id = '999'")).toBe(1);
  });

  it("linking a new chat replaces a person's old one, not add a second", async () => {
    const t = await createTeacher();
    await link(t, 111);
    await link(t, 222);
    expect(await count("SELECT COUNT(*) AS n FROM telegram_links WHERE user_id = ?", t.userId)).toBe(1);
    const row = await env.DB.prepare("SELECT chat_id FROM telegram_links WHERE user_id = ?")
      .bind(t.userId)
      .first<{ chat_id: string }>();
    expect(row?.chat_id).toBe("222");
  });

  it("a message with no code, or plain text, gets a hint and links nothing", async () => {
    const t = await createTeacher();
    await webhook(111, "hello");
    expect(telegramFake.asked[0]!.text).toMatch(/Send \/start/);
    await webhook(111, undefined);
    expect((await status(t)).json.linked).toBe(false);
  });

  it("works whether the code came from a plain /start or a bot with @name attached", async () => {
    const t = await createTeacher();
    const res = await requestCode(t);
    await webhook(111, `/start@TestLmsBot ${codeOf(res.json.deepLink)}`);
    expect((await status(t)).json.linked).toBe(true);
  });

  it("the webhook needs the right secret header, and a wrong or missing one looks like the address does not exist", async () => {
    const t = await createTeacher();
    const res = await requestCode(t);
    const code = codeOf(res.json.deepLink);
    expect((await webhook(111, `/start ${code}`, "wrong-secret")).status).toBe(404);
    expect((await webhook(111, `/start ${code}`, null)).status).toBe(404);
    expect((await status(t)).json.linked).toBe(false); // nothing happened
    expect((await webhook(111, `/start ${code}`)).status).toBe(200); // the right secret still works
    expect((await status(t)).json.linked).toBe(true);
  });

  it("is refused entirely (even with the right-looking header) when no secret is set on the server", async () => {
    const res = await call("/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "anything" },
      body: { message: { chat: { id: 1 }, text: "/start x" } },
      env: { TELEGRAM_WEBHOOK_SECRET: undefined },
    });
    expect(res.status).toBe(404);
  });

  it("hides the feature (link-code refused, status says disabled) when the bot is not set up", async () => {
    const t = await createTeacher();
    expect((await status(t)).json.enabled).toBe(true); // sanity: normally on
    for (const over of [{ TELEGRAM_BOT_TOKEN: undefined }, { TELEGRAM_BOT_USERNAME: undefined }]) {
      const disabled = await call("/api/telegram/status", { cookie: t.cookie, env: over });
      expect(disabled.json).toEqual({ enabled: false, linked: false });
      expect(
        (await call("/api/telegram/link-code", { method: "POST", cookie: t.cookie, env: over })).status,
      ).toBe(404);
    }
  });

  it("needs a signed in person for status, the code and unlinking, but not for the webhook", async () => {
    for (const [path, method] of [
      ["/api/telegram/status", "GET"],
      ["/api/telegram/link-code", "POST"],
      ["/api/telegram/unlink", "POST"],
    ] as const) {
      expect((await call(path, { method })).status).toBe(401);
    }
    // No cookie at all, but the right secret: still answered (Telegram never sends a cookie).
    expect((await webhook(1, "hello")).status).toBe(200);
  });
});

describe("notifications also reach a linked Telegram chat", () => {
  async function setup() {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { maxStudents: null, name: "English A1" });
    const kid = await joinedKid(t, course.id, "Hoa");
    const w = await publish(t, course.id, mixed());
    return { t, course, kid, id: w.id, qs: w.questions };
  }

  it("tells a linked teacher on Telegram when a student hands in work, with the title and a link", async () => {
    const { t, kid, id, qs } = await setup();
    await link(t, 555);
    telegramFake.asked = []; // the "Linked." reply is not part of what we are checking here
    const res = await submit(kid, id, fullAnswers(qs));
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(telegramFake.asked).toHaveLength(1);
    expect(telegramFake.asked[0]).toMatchObject({ chatId: "555" });
    expect(telegramFake.asked[0]!.text).toContain("Hoa handed in work");
    expect(telegramFake.asked[0]!.text).toContain(
      `https://lms.test/assignments/${id}/students/${kid.studentId}`,
    );
  });

  it("sends nothing to Telegram for a teacher who never linked one", async () => {
    const { kid, id, qs } = await setup();
    await submit(kid, id, fullAnswers(qs));
    expect(telegramFake.asked).toEqual([]);
  });

  it("still creates the in-app notification, and still answers 200, when the Telegram send fails", async () => {
    const { t, kid, id, qs } = await setup();
    await link(t, 555);
    telegramFake.ok = false;
    const res = await submit(kid, id, fullAnswers(qs));
    expect(res.status).toBe(200);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'work_handed_in' AND link = ?",
        `/assignments/${id}/students/${kid.studentId}`,
      ),
    ).toBe(1);
  });

  it("the hourly reminder job also forwards to Telegram, once per person even if the job runs twice", async () => {
    const { kid, id } = await setup();
    await link(kid, 777);
    telegramFake.asked = [];
    await setSql(
      "UPDATE assignments SET due_at = ? WHERE id = ?",
      new Date(Date.now() + 10 * 3_600_000).toISOString(),
      id,
    );
    await runNotificationJobs(env);
    await runNotificationJobs(env);
    expect(telegramFake.asked).toHaveLength(1);
    expect(telegramFake.asked[0]).toMatchObject({ chatId: "777" });
    expect(telegramFake.asked[0]!.text).toContain("Due soon");
  });
});
