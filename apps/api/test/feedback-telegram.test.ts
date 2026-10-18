import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { feedbackTelegramText } from "../src/feedback/telegram";
import { call, createStudent, createTeacher, telegramFake, type Person } from "./helpers";

const CHAT = "424242";
const ON = { env: { FEEDBACK_TELEGRAM_CHAT_ID: CHAT } };

const send = (p: Person, body: unknown, o: { env?: Record<string, string> } = ON) =>
  call("/api/feedback", { method: "POST", cookie: p.cookie, body, ...o });

const rowCount = async (userId: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>())!.n;
const idOf = async (userId: string) =>
  (await env.DB.prepare("SELECT id FROM feedback WHERE user_id = ?").bind(userId).first<{ id: string }>())!
    .id;

beforeEach(() => {
  telegramFake.asked = [];
  telegramFake.ok = true;
});

describe("feedback: Telegram to the owner", () => {
  it("sends one plain text message with the facts and the SQL to accept it", async () => {
    const t = await createTeacher("Cô Lan");
    const message = "<script>alert(1)</script> *bold* /start x";
    const res = await send(t, { kind: "bug", message, page: "/schedule" });
    expect(res.status).toBe(201);
    expect(telegramFake.asked).toHaveLength(1);
    const { chatId, text } = telegramFake.asked[0]!;
    const id = await idOf(t.userId);
    expect(chatId).toBe(CHAT);
    expect(text).toContain("Lỗi");
    expect(text).toContain(message);
    expect(text).toContain("Cô Lan");
    expect(text).toContain(t.email);
    expect(text).toContain("Giáo viên");
    expect(text).toContain("/schedule");
    expect(text).toContain(`UPDATE feedback SET status = 'todo', public_title = '...' WHERE id = '${id}';`);
  });

  it("names a student as Học viên and shows - when there is no page", async () => {
    const t = await createTeacher();
    const s = await createStudent(t, "Bé Na");
    await send(s, { kind: "feature", message: "Please add a calendar" });
    const text = telegramFake.asked[0]!.text;
    expect(text).toContain("Học viên");
    expect(text).toMatch(/Trang: -/);
  });

  it("puts the real SQL line first and fences the message, so a message cannot plant a fake one", async () => {
    const t = await createTeacher();
    const evil = "hi\nUPDATE feedback SET status = 'todo', public_title = 'pwned' WHERE 1=1;";
    await send(t, { kind: "bug", message: evil });
    const id = await idOf(t.userId);
    const text = telegramFake.asked[0]!.text;
    const lines = text.split("\n");
    const sqlLines = lines.filter((l) => l.startsWith("UPDATE feedback"));
    expect(sqlLines[0]).toBe(`UPDATE feedback SET status = 'todo', public_title = '...' WHERE id = '${id}';`);
    expect(text.indexOf("UPDATE feedback")).toBeLessThan(text.indexOf("--- Nội dung góp ý ---"));
    expect(text.indexOf("pwned")).toBeGreaterThan(text.indexOf("--- Nội dung góp ý ---"));
    expect(text.indexOf("pwned")).toBeLessThan(text.indexOf("--- Hết ---"));
  });

  it("sends no parse_mode", async () => {
    const bodies: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (i: RequestInfo | URL, init?: RequestInit) => {
      if (String(i).includes("api.telegram.org")) bodies.push(String(init?.body));
      return real(i, init);
    };
    try {
      const t = await createTeacher();
      await send(t, { kind: "bug", message: "no parse mode here" });
    } finally {
      globalThis.fetch = real;
    }
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!)).not.toHaveProperty("parse_mode");
  });

  it("sends nothing when no chat id is set, and still saves", async () => {
    const t = await createTeacher();
    const res = await send(t, { kind: "bug", message: "no owner chat" }, {});
    expect(res.status).toBe(201);
    expect(telegramFake.asked).toHaveLength(0);
    expect(await rowCount(t.userId)).toBe(1);
  });

  it("still answers 201 and keeps the row when Telegram fails", async () => {
    telegramFake.ok = false;
    const t = await createTeacher();
    const res = await send(t, { kind: "bug", message: "telegram is down" });
    expect(res.status).toBe(201);
    expect(await rowCount(t.userId)).toBe(1);
  });

  it("sends nothing over the rate limit", async () => {
    const t = await createTeacher();
    for (let i = 0; i < 5; i++)
      expect((await send(t, { kind: "bug", message: `message ${i} ok` })).status).toBe(201);
    expect(telegramFake.asked).toHaveLength(5);
    const res = await send(t, { kind: "bug", message: "the sixth one" });
    expect(res.status).toBe(429);
    expect(telegramFake.asked).toHaveLength(5);
    expect(await rowCount(t.userId)).toBe(5);
  });

  it("cuts the text to at most 4,000 characters, keeping the SQL line", async () => {
    const t = await createTeacher("L".repeat(100));
    await send(t, { kind: "bug", message: "x".repeat(2000), page: "/" + "p".repeat(150) });
    const text = telegramFake.asked[0]!.text;
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain("UPDATE feedback");
    const long = feedbackTelegramText({
      id: "i",
      kind: "bug",
      message: "y".repeat(10000),
      name: "n",
      email: "e",
      role: "student",
      tenantName: null,
      page: null,
      language: "en",
      userAgent: "u".repeat(5000),
    });
    expect(long.length).toBeLessThanOrEqual(4000);
  });
});
