import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { safePagePath } from "../src/feedback/service";
import { call, createStudent, createTeacher, type Person } from "./helpers";

interface FeedbackRow {
  id: string;
  user_id: string;
  tenant_id: string | null;
  role: string;
  kind: string;
  message: string;
  page: string | null;
  language: string;
  user_agent: string | null;
  status: string;
  public_title: string | null;
  public_title_en: string | null;
}

const rowsOf = async (userId: string) =>
  (
    await env.DB.prepare("SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at, id")
      .bind(userId)
      .all<FeedbackRow>()
  ).results;

const send = (
  p: Person,
  body: unknown,
  o: { headers?: Record<string, string>; noClientHeader?: boolean } = {},
) => call("/api/feedback", { method: "POST", cookie: p.cookie, body, ...o });

describe("feedback: POST /feedback", () => {
  it("saves a teacher's feedback as new, with their tenant, language and a short device text", async () => {
    const t = await createTeacher("Feedback Teacher", { lang: "vi" });
    const res = await send(
      t,
      { kind: "bug", message: "  The schedule is slow  ", page: "/schedule" },
      { headers: { "user-agent": "U".repeat(300) } },
    );
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ ok: true });

    const rows = await rowsOf(t.userId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.status).toBe("new");
    expect(row.role).toBe("teacher");
    expect(row.kind).toBe("bug");
    expect(row.message).toBe("The schedule is slow");
    expect(row.page).toBe("/schedule");
    expect(row.tenant_id).toBe(t.tenantId);
    expect(row.language).toBe("vi");
    expect(row.user_agent).toBe("U".repeat(200));
    expect(row.public_title).toBeNull();
    expect(row.public_title_en).toBeNull();
  });

  it("saves a student's feedback with the student role, the language of the account, and no page when none is sent", async () => {
    const t = await createTeacher();
    const s = await createStudent(t, "Feedback Student");
    const res = await send(s, { kind: "feature", message: "Please add a calendar" });
    expect(res.status).toBe(201);
    const [row] = await rowsOf(s.userId);
    expect(row?.role).toBe("student");
    expect(row?.tenant_id).toBe(t.tenantId);
    expect(row?.language).toBe("en");
    expect(row?.page).toBeNull();
  });

  it("keeps the words exactly as written, even when they look like HTML, Markdown or a bot command", async () => {
    const t = await createTeacher();
    const message = "<script>alert(1)</script> **bold** /start abc [x](javascript:1)";
    expect((await send(t, { kind: "inconvenient", message })).status).toBe(201);
    expect((await rowsOf(t.userId))[0]?.message).toBe(message);
  });

  it("refuses a message that is too short or too long, and an unknown kind", async () => {
    const t = await createTeacher();
    const short = await send(t, { kind: "bug", message: "abc" });
    expect(short.status).toBe(400);
    expect(short.json.error.code).toBe("VALIDATION_FAILED");
    expect(short.json.error.fields.message).toBe("Please write at least 5 characters.");
    // Spaces do not count.
    expect((await send(t, { kind: "bug", message: "  ab   " })).status).toBe(400);
    const long = await send(t, { kind: "bug", message: "x".repeat(2001) });
    expect(long.status).toBe(400);
    expect(long.json.error.fields.message).toBe("This text is too long.");
    expect((await send(t, { kind: "bug", message: "x".repeat(2000) })).status).toBe(201);
    const kind = await send(t, { kind: "praise", message: "Great app, thanks" });
    expect(kind.status).toBe(400);
    expect(kind.json.error.fields.kind).toBe("Please choose a kind of feedback.");
    expect((await send(t, { message: "No kind at all" })).status).toBe(400);
    expect((await send(t, { kind: "bug" })).status).toBe(400);
    expect(
      (await send(t, { kind: "bug", message: "Too long page", page: "/" + "a".repeat(2000) })).status,
    ).toBe(400);
    expect(await rowsOf(t.userId)).toHaveLength(1);
  });

  it("needs a signed in person and the app's own header", async () => {
    const signedOut = await call("/api/feedback", {
      method: "POST",
      body: { kind: "bug", message: "Hello there" },
    });
    expect(signedOut.status).toBe(401);
    const t = await createTeacher();
    const noHeader = await send(t, { kind: "bug", message: "Hello there" }, { noClientHeader: true });
    expect(noHeader.status).toBe(403);
    expect(await rowsOf(t.userId)).toHaveLength(0);
  });

  it("stores a hostile page path as nothing", async () => {
    const t = await createTeacher();
    const hostile = [
      "//evil.com",
      "/x?token=abc",
      "/a#b",
      "javascript:alert(1)",
      "schedule",
      "/" + "a".repeat(200),
    ];
    for (const page of hostile) {
      // More sends than the hourly limit allows, so the counter is cleared each time.
      await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?").bind(`feedback:user:${t.userId}`).run();
      expect((await send(t, { kind: "bug", message: "Something is off", page })).status, page).toBe(201);
    }
    const rows = await rowsOf(t.userId);
    expect(rows).toHaveLength(hostile.length);
    expect(rows.map((r) => r.page)).toEqual(hostile.map(() => null));
  });

  it("takes at most 5 in an hour from one person; someone else can still send", async () => {
    const t = await createTeacher();
    for (let i = 0; i < 5; i++) {
      expect((await send(t, { kind: "bug", message: `Feedback number ${i}` })).status).toBe(201);
    }
    const sixth = await send(t, { kind: "bug", message: "Feedback number 6" });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.code).toBe("RATE_LIMITED");
    expect(await rowsOf(t.userId)).toHaveLength(5);

    const other = await createTeacher();
    expect((await send(other, { kind: "bug", message: "Another person" })).status).toBe(201);
  });
});

describe("feedback: safePagePath", () => {
  it("keeps a plain path inside the app", () => {
    expect(safePagePath("/schedule")).toBe("/schedule");
    expect(safePagePath("/")).toBe("/");
    expect(safePagePath("/" + "a".repeat(199))).toBe("/" + "a".repeat(199));
  });

  it("drops anything else", () => {
    for (const page of [
      undefined,
      "",
      "//evil.com",
      "/x?token=abc",
      "/a#b",
      "javascript:alert(1)",
      "schedule",
      "https://evil.com/",
      "/" + "a".repeat(200),
      "/" + "a".repeat(10 * 1024),
      "/\\evil.com",
      "/x\nUPDATE feedback",
      "/a\tb",
      "/a\u0000",
      "/a\u007f",
    ]) {
      expect(safePagePath(page), String(page).slice(0, 40)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------- the board

const SECRET = "SECRET-WORDS-of-the-sender-7f3a";

let seq = 0;
async function addRow(
  p: Person,
  o: {
    status: string;
    title?: string | null;
    titleEn?: string | null;
    kind?: string;
    role?: string;
    createdAt?: string;
  },
): Promise<string> {
  const id = `fb-${Date.now()}-${seq++}`;
  const at = o.createdAt ?? new Date(Date.UTC(2026, 9, 1, 0, 0, seq)).toISOString();
  await env.DB.prepare(
    `INSERT INTO feedback (id, user_id, tenant_id, role, kind, message, page, language, user_agent, status,
       public_title, public_title_en, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '/secret-page', 'vi', 'SecretDevice/1.0', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      p.userId,
      p.tenantId,
      o.role ?? "teacher",
      o.kind ?? "bug",
      SECRET,
      o.status,
      o.title === undefined ? `Title ${id}` : o.title,
      o.titleEn ?? null,
      at,
      at,
    )
    .run();
  return id;
}

const board = (p: Person) => call("/api/feedback/board", { cookie: p.cookie });
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("feedback: GET /feedback/board", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM feedback").run();
  });

  it("shows only accepted items with a title, in the right column, newest first", async () => {
    const t = await createTeacher("Board Sender");
    const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 10, n)).toISOString();
    const todoOld = await addRow(t, { status: "todo", createdAt: at(1) });
    const todoNew = await addRow(t, { status: "todo", createdAt: at(5) });
    await addRow(t, { status: "todo", title: null, createdAt: at(6) });
    await addRow(t, { status: "todo", title: "", createdAt: at(7) });
    await addRow(t, { status: "todo", title: "   ", createdAt: at(8) });
    const doing = await addRow(t, { status: "in_progress", createdAt: at(2) });
    const doneOld = await addRow(t, { status: "done", createdAt: at(3) });
    const doneNew = await addRow(t, { status: "done", createdAt: at(4) });
    await addRow(t, { status: "new", createdAt: at(9) });
    await addRow(t, { status: "rejected", createdAt: at(10) });

    const res = await board(t);
    expect(res.status).toBe(200);
    expect(ids(res.json.todo)).toEqual([todoNew, todoOld]);
    expect(ids(res.json.inProgress)).toEqual([doing]);
    expect(ids(res.json.done)).toEqual([doneNew, doneOld]);
    expect(Object.keys(res.json).sort()).toEqual(["done", "inProgress", "todo"]);
  });

  it("never shows the sender's words or who sent it", async () => {
    const t = await createTeacher("Very Secret Name");
    const s = await createStudent(t, "Hidden Student Name");
    const id = await addRow(t, { status: "todo", title: "Faster schedule", kind: "feature" });
    const sid = await addRow(s, {
      status: "done",
      title: "Fixed homework",
      role: "student",
      kind: "inconvenient",
    });

    const res = await call("/api/feedback/board", { cookie: t.cookie });
    const all = [...res.json.todo, ...res.json.inProgress, ...res.json.done];
    expect(all).toHaveLength(2);
    for (const card of all)
      expect(Object.keys(card).sort()).toEqual(["createdAt", "id", "kind", "role", "title"]);
    expect(res.json.todo[0]).toMatchObject({
      id,
      title: "Faster schedule",
      kind: "feature",
      role: "teacher",
    });
    expect(res.json.done[0]).toMatchObject({
      id: sid,
      title: "Fixed homework",
      kind: "inconvenient",
      role: "student",
    });

    const raw = JSON.stringify(res.json);
    for (const hidden of [
      SECRET,
      "Very Secret Name",
      "Hidden Student Name",
      t.email,
      s.email,
      t.userId,
      s.userId,
      t.tenantId,
      "/secret-page",
      "SecretDevice",
    ]) {
      expect(raw.includes(hidden), hidden).toBe(false);
    }
  });

  it("is one list for everybody: a teacher of another tenant sees the same cards", async () => {
    const t = await createTeacher();
    const other = await createTeacher();
    await addRow(t, { status: "todo" });
    await addRow(t, { status: "done" });
    const mine = await board(t);
    const theirs = await board(other);
    expect(theirs.status).toBe(200);
    expect(theirs.json).toEqual(mine.json);
    expect(mine.json.todo).toHaveLength(1);
  });

  it("gives an English reader the English title when there is one, and a Vietnamese reader the Vietnamese one", async () => {
    const t = await createTeacher("Reader", { lang: "vi" });
    const en = await createTeacher("Reader en", { lang: "en" });
    const both = await addRow(t, { status: "todo", title: "Lịch nhanh hơn", titleEn: "Faster schedule" });
    const viOnly = await addRow(t, { status: "todo", title: "Chỉ tiếng Việt" });
    const emptyEn = await addRow(t, { status: "todo", title: "Tiêu đề", titleEn: "  " });

    const titles = async (p: Person) =>
      Object.fromEntries(
        ((await board(p)).json.todo as { id: string; title: string }[]).map((c) => [c.id, c.title]),
      );
    expect(await titles(en)).toEqual({
      [both]: "Faster schedule",
      [viOnly]: "Chỉ tiếng Việt",
      [emptyEn]: "Tiêu đề",
    });
    expect(await titles(t)).toEqual({
      [both]: "Lịch nhanh hơn",
      [viOnly]: "Chỉ tiếng Việt",
      [emptyEn]: "Tiêu đề",
    });
  });

  it("shows at most 50 cards in a column", async () => {
    const t = await createTeacher();
    for (let i = 0; i < 51; i++) await addRow(t, { status: "done" });
    const res = await board(t);
    expect(res.json.done).toHaveLength(50);
  });

  it("needs a signed in person", async () => {
    expect((await call("/api/feedback/board")).status).toBe(401);
  });
});
