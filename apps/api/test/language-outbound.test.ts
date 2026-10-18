import { env } from "cloudflare:workers";
import { SERVER_TEXT } from "@lms/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { EMAIL_IDS, NOTICE_IDS } from "../src/lib/outbound-text";
import {
  call,
  createCourse,
  createStudent,
  createTeacher,
  telegramFake,
  uniqueEmail,
  type Person,
} from "./helpers";
import { fullAnswers, mixed, publish, submit, type Kid } from "./homework";

// Emails, the bell and Telegram speak the language of the person they are for, not of the request.

interface Mail {
  kind: string;
  subject: string;
  body_text: string;
}
const mailsTo = async (email: string) =>
  (
    await env.DB.prepare(
      "SELECT kind, subject, body_text FROM email_outbox WHERE to_email = ? ORDER BY created_at, id",
    )
      .bind(email)
      .all<Mail>()
  ).results;
const lastMail = async (email: string, kind: string) =>
  (await mailsTo(email)).filter((m) => m.kind === kind).at(-1)!;

const requestLink = (email: string, o: { waitUntil?: Promise<unknown>[]; lang?: string | null } = {}) =>
  call("/api/auth/sign-in-link/request", { method: "POST", body: { email }, ...o });
const invite = (t: Person, email: string, name = "Sam") =>
  call("/api/invites", { method: "POST", cookie: t.cookie, body: { name, email } });

interface Item {
  kind: string;
  title: string;
  body: string;
}
const bell = async (p: Person) =>
  (await call("/api/notifications", { cookie: p.cookie })).json.items as Item[];

/** A student of `t` in this language, in the course. */
async function kidIn(t: Person, courseId: string, name: string, lang: "vi" | "en"): Promise<Kid> {
  const kid = await createStudent(t, name, { lang });
  const all = (await call("/api/students?page=1", { cookie: t.cookie })).json.students as {
    id: string;
    email: string;
  }[];
  const studentId = all.find((s) => s.email === kid.email)!.id;
  const res = await call(`/api/courses/${courseId}/students`, {
    method: "POST",
    cookie: t.cookie,
    body: { studentIds: [studentId], customPrice: null },
  });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return { ...kid, studentId };
}

const webhook = (chatId: number, text: string) =>
  call("/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-webhook-secret" },
    body: { message: { chat: { id: chatId }, text } },
  });

async function linkTelegram(p: Person, chatId: number): Promise<string> {
  const code = await call("/api/telegram/link-code", { method: "POST", cookie: p.cookie });
  expect(code.status, JSON.stringify(code.json)).toBe(200);
  await webhook(chatId, `/start ${new URL(code.json.deepLink).searchParams.get("start")}`);
  return telegramFake.asked.at(-1)!.text;
}

beforeEach(() => {
  telegramFake.asked = [];
  telegramFake.ok = true;
});

describe("the texts each email and notification may hold", () => {
  it("are all in the table, so none is left in English by mistake", () => {
    const ids = new Set(SERVER_TEXT.map((e) => e.id));
    const listed = [
      ...Object.values(EMAIL_IDS).flat(),
      ...Object.values(NOTICE_IDS).flatMap((n) => [...n.title, ...n.body]),
    ];
    expect(listed.filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("emails", () => {
  it("sends the sign in link in English to an English account", async () => {
    const t = await createTeacher("Lan Tran");
    expect((await requestLink(t.email, { lang: "vi" })).status).toBe(202);
    const mail = await lastMail(t.email, "magic_link");
    expect(mail.subject).toBe("Your sign in link");
    expect(mail.body_text.split("\n")[0]).toBe("Hi Lan Tran,");
    expect(mail.body_text).toContain("Use this link to sign in. You do not need a password:");
  });

  it("sends the sign in link in Vietnamese to a Vietnamese account; the link line is unchanged", async () => {
    const t = await createTeacher("Lan Tran", { lang: null });
    // The language of the request does not matter, only the account's.
    expect((await requestLink(t.email, { lang: "en" })).status).toBe(202);
    const mail = await lastMail(t.email, "magic_link");
    expect(mail.subject).toBe("Liên kết đăng nhập của bạn");
    const lines = mail.body_text.split("\n");
    expect(lines[0]).toBe("Xin chào Lan Tran,");
    expect(lines[1]).toBe("");
    expect(lines[2]).not.toBe("Use this link to sign in. You do not need a password:");
    expect(lines[3]).toMatch(/^https:\/\/lms\.test\/magic-link\?token=[A-Za-z0-9_-]+$/);
    expect(lines[5]).not.toMatch(/This link works/);
    expect(lines).toHaveLength(6);
  });

  it("hands the sending, language lookup included, to the work done after the answer", async () => {
    const t = await createTeacher("Lan Tran", { lang: null });
    const work: Promise<unknown>[] = [];
    const res = await requestLink(t.email, { waitUntil: work });
    expect(res.status).toBe(202);
    expect(work).toHaveLength(1);
    await Promise.all(work);
    expect((await lastMail(t.email, "magic_link")).subject).toBe("Liên kết đăng nhập của bạn");
  });

  it("gives the same answer for an address with an account and without one", async () => {
    const t = await createTeacher("Lan Tran", { lang: null });
    const a = await requestLink(t.email);
    const b = await requestLink(uniqueEmail());
    expect(a.status).toBe(202);
    expect(b.status).toBe(a.status);
    expect(b.json).toEqual(a.json);
    expect(b.headers.get("content-type")).toBe(a.headers.get("content-type"));
  });

  it("invites a new address in Vietnamese", async () => {
    const t = await createTeacher("Ms Lan");
    const email = uniqueEmail("kid");
    expect((await invite(t, email)).status).toBe(202);
    const mail = await lastMail(email, "invite");
    expect(mail.subject).toBe("Ms Lan đã mời bạn");
    expect(mail.body_text.split("\n")[0]).toBe("Xin chào Sam,");
    expect(mail.body_text).toMatch(/\nhttps:\/\/lms\.test\/accept-invite\?token=[A-Za-z0-9_-]+\n/);
  });

  it("invites an address that already has an English account in English", async () => {
    const t = await createTeacher("Ms Lan");
    const other = await createTeacher("Sam Lee");
    expect((await invite(t, other.email)).status).toBe(202);
    const mail = await lastMail(other.email, "invite");
    expect(mail.subject).toBe("Ms Lan invited you");
    expect(mail.body_text.split("\n")[0]).toBe("Hi Sam,");
    expect(mail.body_text).toContain("Ms Lan invited you to join their class. Accept the invite here:");
  });

  it("keeps a name that looks like a catalog text as it is", async () => {
    const t = await createTeacher("Your fee receipt for x");
    const email = uniqueEmail("kid");
    expect((await invite(t, email, "Due soon: y")).status).toBe(202);
    const mail = await lastMail(email, "invite");
    expect(mail.subject).toBe("Your fee receipt for x đã mời bạn");
    expect(mail.body_text.split("\n")[0]).toBe("Xin chào Due soon: y,");
  });
});

describe("the bell", () => {
  it("shows each student the new homework in their own language, the homework title as it is", async () => {
    const t = await createTeacher("Lan Tran");
    // A course name that is also a catalog text stays as it is: it is the teacher's text.
    const course = await createCourse(t, { name: "Your class time changed", maxStudents: null });
    const vi = await kidIn(t, course.id, "Hoa", "vi");
    const en = await kidIn(t, course.id, "Nam", "en");
    await publish(t, course.id, mixed({ title: "Due soon: x" }));

    expect(await bell(vi)).toMatchObject([
      { kind: "homework_new", title: "Bài tập mới: Due soon: x", body: "Your class time changed" },
    ]);
    expect(await bell(en)).toMatchObject([
      { kind: "homework_new", title: "New homework: Due soon: x", body: "Your class time changed" },
    ]);
  });

  it("does not let a homework title match another catalog text", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { maxStudents: null });
    const vi = await kidIn(t, course.id, "Hoa", "vi");
    await publish(t, course.id, mixed({ title: "Bob handed in work" }));
    expect((await bell(vi))[0]!.title).toBe("Bài tập mới: Bob handed in work");
  });

  it("tells a Vietnamese teacher in Vietnamese that work was handed in, names as they are", async () => {
    const t = await createTeacher("Lan Tran", { lang: null });
    const course = await createCourse(t, { name: "English A1", maxStudents: null });
    const kid = await kidIn(t, course.id, "New homework: Hoa", "en");
    const w = await publish(t, course.id, mixed({ title: "Unit 1" }));
    expect((await submit(kid, w.id, fullAnswers(w.questions))).status).toBe(200);
    const items = (await bell(t)).filter((i) => i.kind === "work_handed_in");
    expect(items).toMatchObject([{ title: "New homework: Hoa đã nộp bài", body: "Unit 1 · English A1" }]);
  });
});

describe("Telegram", () => {
  it("sends a Vietnamese student the Vietnamese title, and replies to the link in their language", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { name: "English A1", maxStudents: null });
    const vi = await kidIn(t, course.id, "Hoa", "vi");
    const en = await kidIn(t, course.id, "Nam", "en");
    expect(await linkTelegram(vi, 501)).toBe("Đã liên kết tài khoản. Bạn cũng sẽ nhận thông báo tại đây.");
    expect(await linkTelegram(en, 502)).toBe("Linked. You will get your notifications here too.");

    telegramFake.asked = [];
    const w = await publish(t, course.id, mixed({ title: "Due soon: x" }));
    const to = (chatId: string) => telegramFake.asked.find((m) => m.chatId === chatId)!.text.split("\n");
    expect(to("501")).toEqual(["Bài tập mới: Due soon: x", "English A1", `https://lms.test/my/work/${w.id}`]);
    expect(to("502")).toEqual([
      "New homework: Due soon: x",
      "English A1",
      `https://lms.test/my/work/${w.id}`,
    ]);
  });

  it("replies in Vietnamese to a bad code from a chat nobody linked", async () => {
    expect((await webhook(90001, "/start not-a-real-code")).status).toBe(200);
    expect(telegramFake.asked.at(-1)).toEqual({
      chatId: "90001",
      text: "Mã này đã hết hạn hoặc không còn hiệu lực. Vui lòng yêu cầu mã mới trong ứng dụng.",
    });
    await webhook(90001, "hello");
    expect(telegramFake.asked.at(-1)!.text).toBe(
      "Gửi lệnh /start cùng mã trong ứng dụng để liên kết tài khoản.",
    );
  });

  it("replies to a linked chat in the language of the person who linked it", async () => {
    const t = await createTeacher("Lan Tran");
    await linkTelegram(t, 503);
    await webhook(503, "hello");
    expect(telegramFake.asked.at(-1)!.text).toBe(
      "Send /start with the code shown in the app to link your account.",
    );
  });
});

describe("fee receipts", () => {
  it("names the month as MM/YYYY in the notification and the email", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { pricePerLesson: 100_000, maxStudents: null });
    const vi = await kidIn(t, course.id, "Hoa", "vi");
    const made = await call(`/api/courses/${course.id}/lessons`, {
      method: "POST",
      cookie: t.cookie,
      body: {
        title: "Lesson",
        date: "2020-10-05",
        startTime: "18:30",
        durationMinutes: 90,
        place: "",
        onlineUrl: null,
      },
    });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const lessonId = made.json.lessons[0].id as string;
    const marked = await call(`/api/lessons/${lessonId}/attendance`, {
      method: "PUT",
      cookie: t.cookie,
      body: { records: [{ studentId: vi.studentId, status: "attended" }] },
    });
    expect(marked.status, JSON.stringify(marked.json)).toBe(200);
    expect(
      (
        await call("/api/invoices/generate", {
          method: "POST",
          cookie: t.cookie,
          body: { period: "2020-10" },
        })
      ).status,
    ).toBe(201);
    const list = await call("/api/invoices?period=2020-10", { cookie: t.cookie });
    const inv = list.json.invoices[0] as { id: string };
    const full = (await call(`/api/invoices/${inv.id}`, { cookie: t.cookie })).json.invoice as {
      version: number;
    };
    const sent = await call(`/api/invoices/${inv.id}/send`, {
      method: "POST",
      cookie: t.cookie,
      body: { version: full.version },
    });
    expect(sent.status, JSON.stringify(sent.json)).toBe(200);

    expect((await bell(vi)).find((i) => i.kind === "receipt_sent")).toMatchObject({
      title: "Phiếu thu học phí mới: 10/2020",
      body: "Lan Tran's classroom", // the name on the receipt, as it is
    });
    const mail = await lastMail(vi.email, "invoice");
    expect(mail.subject).toBe("Phiếu thu học phí tháng 10/2020");
    expect(mail.body_text).toContain("Lan Tran's classroom đã gửi cho bạn phiếu thu học phí tháng 10/2020.");
  });
});
