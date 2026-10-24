import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import {
  deliver,
  drainQueue,
  JOB_SEND_LIMIT,
  MAX_IN_FLIGHT,
  REQUEST_SEND_LIMIT,
} from "../src/notifications/delivery";
import { runNotificationJobs } from "../src/notifications/jobs";
import { sendPush } from "../src/push/client";
import { call, createCourse, createTeacher, pushFake, telegramFake, type Person } from "./helpers";
import { joinedKid, mixed, publish, type Kid } from "./homework";
import { decryptPayload, makeReceiver, makeVapidKeys, verifyVapidJwt } from "./push";

// The configured key (wrangler.test.jsonc, or a developer's own .dev.vars, which the test runner also reads).
const PUBLIC_KEY = env.VAPID_PUBLIC_KEY!;

const setSql = (sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql)
    .bind(...args)
    .first<{ n: number }>())!.n;
const queued = () => count("SELECT COUNT(*) AS n FROM outbound_queue");

type Receiver = Awaited<ReturnType<typeof makeReceiver>>;
let device = 0;

/** Turns push on in the browser this person is signed in on. Returns the browser's side, to read what arrives. */
async function enablePush(
  p: Person,
  endpoint = `https://fcm.googleapis.com/fcm/send/${Date.now()}-${device++}`,
): Promise<{ endpoint: string; receiver: Receiver }> {
  const receiver = await makeReceiver();
  const res = await call("/api/push/subscribe", {
    method: "POST",
    cookie: p.cookie,
    body: { endpoint, keys: { p256dh: receiver.p256dh, auth: receiver.auth } },
  });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return { endpoint, receiver };
}

async function read(sent: { body: Uint8Array }, receiver: Receiver) {
  const plain = await decryptPayload(sent.body, receiver.keys, receiver.authBytes);
  return JSON.parse(new TextDecoder().decode(plain)) as { title: string; body: string; link: string };
}

/** A teacher and a course with `n` students who joined, each with push on in one browser. */
async function classWithPush(n: number) {
  const t = await createTeacher("Lan Tran");
  const course = await createCourse(t, { name: "English A1", maxStudents: null });
  const kids: (Kid & { endpoint: string; receiver: Receiver })[] = [];
  for (let i = 0; i < n; i++) {
    // A real teacher sends at most 20 invites a minute; the test does not want to wait.
    if (i % 15 === 0) await setSql("DELETE FROM rate_limits WHERE key LIKE 'invite:%'");
    const kid = await joinedKid(t, course.id, `Kid ${i}`);
    kids.push({ ...kid, ...(await enablePush(kid)) });
  }
  return { t, course, kids };
}

async function linkTelegram(p: Person, chatId: number) {
  const code = await call("/api/telegram/link-code", { method: "POST", cookie: p.cookie });
  const start = new URL(code.json.deepLink).searchParams.get("start");
  const res = await call("/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-webhook-secret" },
    body: { message: { chat: { id: chatId }, text: `/start ${start}` } },
  });
  expect(res.status).toBe(200);
}

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** Runs the Worker's schedule as the runtime would, and waits for what it handed to waitUntil. */
async function runSchedule(cron: string) {
  const waiting: Promise<unknown>[] = [];
  await worker.scheduled!({ cron } as never, env, {
    waitUntil: (p: Promise<unknown>) => waiting.push(p),
  } as never);
  await Promise.all(waiting);
}

beforeEach(async () => {
  pushFake.sent = [];
  pushFake.status = 201;
  pushFake.throws = false;
  pushFake.delayMs = 0;
  pushFake.inFlight = 0;
  pushFake.maxInFlight = 0;
  pushFake.onSend = undefined;
  telegramFake.asked = [];
  telegramFake.ok = true;
  await setSql("DELETE FROM outbound_queue");
  // Failed sends are logged on purpose; the tests below make many of them.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The "new homework" notifications of these kids, as the statement would return them. */
const homeworkRows = (kids: { userId: string }[]) =>
  kids.map((k) => ({
    user_id: k.userId,
    kind: "homework_new",
    title: "You have a new assignment!",
    body: "You have a new assignment from English A1.",
    link: "/my/work/1",
  }));

describe("pushing notifications to browsers", () => {
  it("pushes a new homework to every subscribed device of the class, in each person's language", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { name: "English A1", maxStudents: null });
    const hoa = await joinedKid(t, course.id, "Hoa");
    const nam = await joinedKid(t, course.id, "Nam");
    await call("/api/me/language", { method: "PUT", cookie: hoa.cookie, body: { language: "vi" } });
    const hoaDevice = await enablePush(hoa);
    const namDevice = await enablePush(nam);

    const w = await publish(t, course.id, mixed());

    expect(pushFake.sent).toHaveLength(2);
    const toHoa = pushFake.sent.find((s) => s.endpoint === hoaDevice.endpoint)!;
    const toNam = pushFake.sent.find((s) => s.endpoint === namDevice.endpoint)!;
    expect(await read(toHoa, hoaDevice.receiver)).toEqual({
      title: "Bạn có 1 bài tập mới!",
      body: "Bạn có 1 bài tập mới từ lớp English A1",
      link: `/my/work/${w.id}`,
    });
    expect(await read(toNam, namDevice.receiver)).toEqual({
      title: "You have a new assignment!",
      body: "You have a new assignment from English A1.",
      link: `/my/work/${w.id}`,
    });

    // What a push service needs to accept and keep the message, signed for its own origin by our key.
    expect(toHoa.headers.get("ttl")).toBe("86400");
    expect(toHoa.headers.get("urgency")).toBe("normal");
    expect(toHoa.headers.get("content-encoding")).toBe("aes128gcm");
    const auth = toHoa.headers.get("authorization")!;
    const jwt = auth.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(jwt[2]).toBe(PUBLIC_KEY);
    expect(await verifyVapidJwt(jwt[1]!, PUBLIC_KEY)).toMatchObject({
      aud: "https://fcm.googleapis.com",
      sub: "https://lms.test",
    });
    expect(await queued()).toBe(0);
  });

  it("sends no more than the limit at once and queues the rest, which the minute job sends", async () => {
    const { t, course, kids } = await classWithPush(REQUEST_SEND_LIMIT + 5);
    await publish(t, course.id, mixed());
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(await queued()).toBe(5);

    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT + 5);
    expect(new Set(pushFake.sent.map((s) => s.endpoint))).toEqual(new Set(kids.map((k) => k.endpoint)));
    expect(await queued()).toBe(0);

    // A queued message is the same message: the student who waited reads the same words.
    const last = pushFake.sent.at(-1)!;
    const kid = kids.find((k) => k.endpoint === last.endpoint)!;
    expect((await read(last, kid.receiver)).title).toBe("You have a new assignment!");
  });

  it("counts push only in the limit: linked Telegram chats add nothing", async () => {
    const pushes = REQUEST_SEND_LIMIT + 5;
    const { t, course, kids } = await classWithPush(pushes);
    for (const [i, kid] of kids.slice(0, 7).entries()) await linkTelegram(kid, 9100 + i);
    telegramFake.asked = []; // the "Linked." replies are not notifications

    await publish(t, course.id, mixed());
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(await queued()).toBe(5);
    expect(await count("SELECT COUNT(*) AS n FROM outbound_queue WHERE channel = 'telegram'")).toBe(0);

    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(pushes);
    expect(telegramFake.asked).toEqual([]);
    expect(await queued()).toBe(0);
  });

  it("removes a subscription the push service says is gone", async () => {
    const { t, course, kids } = await classWithPush(1);
    pushFake.status = 410;
    await publish(t, course.id, mixed());
    expect(pushFake.sent).toHaveLength(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", kids[0]!.endpoint),
    ).toBe(0);
    expect(await queued()).toBe(0);
  });

  it("retries a failed send and gives up after three tries", async () => {
    const { t, course } = await classWithPush(1);
    pushFake.status = 500;
    await publish(t, course.id, mixed());
    expect(pushFake.sent).toHaveLength(1);
    expect(await queued()).toBe(1);

    // Not yet: the next try waits a few minutes.
    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(1);

    await drainQueue(env, undefined, later(6));
    expect(pushFake.sent).toHaveLength(2);
    expect(await queued()).toBe(1);
    await drainQueue(env, undefined, later(30));
    expect(pushFake.sent).toHaveLength(3);
    expect(await queued()).toBe(0);
    await drainQueue(env, undefined, later(120));
    expect(pushFake.sent).toHaveLength(3);
  });

  it("does not push to a device whose session was signed out", async () => {
    const { t, course, kids } = await classWithPush(1);
    const res = await call("/api/auth/sign-out", { method: "POST", cookie: kids[0]!.cookie });
    expect(res.status).toBe(200);
    await publish(t, course.id, mixed());
    expect(pushFake.sent).toEqual([]);
    expect(await queued()).toBe(0);
  });

  it("still pushes to a device whose session idled out of the app", async () => {
    const { t, course, kids } = await classWithPush(1);
    await setSql(
      `UPDATE sessions SET last_seen_at = ?
       WHERE id = (SELECT session_id FROM push_subscriptions WHERE endpoint = ?)`,
      new Date(Date.now() - 31 * 86_400_000).toISOString(),
      kids[0]!.endpoint,
    );
    await publish(t, course.id, mixed());
    expect(pushFake.sent.map((s) => s.endpoint)).toEqual([kids[0]!.endpoint]);
  });

  it("still sends a queued message to a device whose session idled out of the app", async () => {
    const { t, course } = await classWithPush(REQUEST_SEND_LIMIT + 1);
    await publish(t, course.id, mixed());
    expect(await queued()).toBe(1);
    await setSql(
      "UPDATE sessions SET last_seen_at = ?",
      new Date(Date.now() - 31 * 86_400_000).toISOString(),
    );
    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT + 1);
    expect(await queued()).toBe(0);
  });

  it("drops a queued message whose device was signed out before it went", async () => {
    const { t, course, kids } = await classWithPush(REQUEST_SEND_LIMIT + 1);
    await publish(t, course.id, mixed());
    expect(await queued()).toBe(1);
    const waiting = await env.DB.prepare(
      "SELECT p.endpoint FROM outbound_queue q JOIN push_subscriptions p ON p.id = q.target",
    ).first<{ endpoint: string }>();
    const kid = kids.find((k) => k.endpoint === waiting!.endpoint)!;
    await call("/api/auth/sign-out", { method: "POST", cookie: kid.cookie });

    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(await queued()).toBe(0);
  });

  it("forgets a subscription whose stored key cannot be used, without failing the others", async () => {
    const { t, course, kids } = await classWithPush(2);
    // 65 bytes starting with 0x04 pass the check at subscribe, but are not a point on the curve.
    const notOnCurve = Buffer.from(new Uint8Array([4, ...new Array(64).fill(1)])).toString("base64url");
    await setSql(
      "UPDATE push_subscriptions SET p256dh = ? WHERE endpoint = ?",
      notOnCurve,
      kids[0]!.endpoint,
    );
    await publish(t, course.id, mixed());
    expect(pushFake.sent.map((s) => s.endpoint)).toEqual([kids[1]!.endpoint]);
    expect(await queued()).toBe(0); // it can never work, so it is not tried again
    expect(
      await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?", kids[0]!.endpoint),
    ).toBe(0);
  });

  it("keeps the messages over the limit in the queue even when saving the results fails", async () => {
    const { kids } = await classWithPush(REQUEST_SEND_LIMIT + 3);
    pushFake.status = 500;
    // Saving what happened to the sends (failures to retry) fails, for example the run was cut short.
    vi.spyOn(env.DB, "batch").mockRejectedValue(new Error("database gone"));
    await deliver(env, homeworkRows(kids), REQUEST_SEND_LIMIT);
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(await queued()).toBe(3);
  });

  it("signs once for a whole batch to one push service", async () => {
    const { kids } = await classWithPush(REQUEST_SEND_LIMIT + 1);
    // Fresh keys, so nothing is cached from the tests before.
    const keys = await makeVapidKeys();
    const sign = vi.spyOn(crypto.subtle, "sign");
    await deliver(
      { ...env, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey },
      homeworkRows(kids),
      REQUEST_SEND_LIMIT,
    );
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(new Set(pushFake.sent.map((s) => s.headers.get("authorization"))).size).toBe(1);
  });

  it("never fails the action when sending fails", async () => {
    const { t, course, kids } = await classWithPush(2);
    pushFake.throws = true;
    const made = await call(`/api/courses/${course.id}/assignments`, {
      method: "POST",
      cookie: t.cookie,
      body: mixed(),
    });
    const waitUntil: Promise<unknown>[] = [];
    const res = await call(`/api/assignments/${made.json.assignment.id}/publish`, {
      method: "POST",
      cookie: t.cookie,
      body: {},
      waitUntil,
    });
    expect(res.status).toBe(200);
    await Promise.all(waitUntil);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'homework_new' AND user_id = ?",
        kids[0]!.userId,
      ),
    ).toBe(1);
    expect(await queued()).toBe(2); // to be tried again later
  });

  it("the hourly job sends due-soon and overdue reminders within one limit", async () => {
    const { t, course } = await classWithPush(JOB_SEND_LIMIT / 2 + 1);
    const soon = await publish(t, course.id, mixed({ title: "Soon" }));
    const late = await publish(t, course.id, mixed({ title: "Late", allowLate: true }));
    pushFake.sent = []; // the "new homework" pushes
    await setSql("DELETE FROM outbound_queue");
    await setSql(
      "UPDATE assignments SET due_at = ? WHERE id = ?",
      new Date(Date.now() + 5 * 3_600_000).toISOString(),
      soon.id,
    );
    await setSql(
      "UPDATE assignments SET due_at = ? WHERE id = ?",
      new Date(Date.now() - 30 * 60_000).toISOString(),
      late.id,
    );

    await runNotificationJobs(env);
    expect(pushFake.sent).toHaveLength(JOB_SEND_LIMIT);
    expect(await queued()).toBe(2);
    await drainQueue(env);
    expect(pushFake.sent).toHaveLength(JOB_SEND_LIMIT + 2);
  });

  it("the minute schedule sends what waits", async () => {
    const { t, course } = await classWithPush(REQUEST_SEND_LIMIT + 1);
    await publish(t, course.id, mixed());
    expect(await queued()).toBe(1);
    await runSchedule("* * * * *");
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT + 1);
    expect(await queued()).toBe(0);
  });

  it("the hourly schedule sends the reminders last, after the other jobs are done", async () => {
    const { t, course } = await classWithPush(1);
    const soon = await publish(t, course.id, mixed({ title: "Soon" }));
    pushFake.sent = [];
    await setSql(
      "UPDATE assignments SET due_at = ? WHERE id = ?",
      new Date(Date.now() + 5 * 3_600_000).toISOString(),
      soon.id,
    );
    // Something the clean up removes: a dev email older than a week.
    await setSql(
      `INSERT INTO email_outbox (id, kind, to_email, subject, body_text, status, created_at)
       VALUES ('order-check', 'invite', 'a@example.com', 's', 'link', 'logged', ?)`,
      new Date(Date.now() - 8 * 86_400_000).toISOString(),
    );
    const cleanedBeforeSend: number[] = [];
    pushFake.onSend = async () => {
      cleanedBeforeSend.push(await count("SELECT COUNT(*) AS n FROM email_outbox WHERE id = 'order-check'"));
    };
    await runSchedule("0 * * * *");
    expect(pushFake.sent).toHaveLength(1);
    expect(cleanedBeforeSend).toEqual([0]);
  });

  it("never has more than a few sends open at once", async () => {
    const { kids } = await classWithPush(REQUEST_SEND_LIMIT);
    pushFake.delayMs = 20;
    await deliver(env, homeworkRows(kids), REQUEST_SEND_LIMIT);
    expect(pushFake.sent).toHaveLength(REQUEST_SEND_LIMIT);
    expect(pushFake.maxInFlight).toBe(MAX_IN_FLIGHT);

    pushFake.maxInFlight = 0;
    pushFake.status = 500;
    await deliver(env, homeworkRows(kids), REQUEST_SEND_LIMIT);
    pushFake.status = 201;
    pushFake.maxInFlight = 0;
    await drainQueue(env, undefined, later(6));
    expect(await queued()).toBe(0);
    expect(pushFake.maxInFlight).toBe(MAX_IN_FLIGHT);
  });

  it("does not follow a redirect from a push service", async () => {
    const { t, course } = await classWithPush(1);
    await publish(t, course.id, mixed());
    expect(pushFake.sent[0]!.redirect).toBe("manual");
  });

  it("does not push to a person whose account was turned off, also not what waits", async () => {
    const { t, course, kids } = await classWithPush(2);
    pushFake.status = 500;
    await publish(t, course.id, mixed());
    expect(await queued()).toBe(2);
    await setSql("UPDATE users SET disabled_at = ? WHERE id = ?", new Date().toISOString(), kids[0]!.userId);
    pushFake.status = 201;
    pushFake.sent = [];
    await drainQueue(env, undefined, later(6));
    expect(pushFake.sent.map((s) => s.endpoint)).toEqual([kids[1]!.endpoint]);

    pushFake.sent = [];
    await deliver(env, homeworkRows(kids), REQUEST_SEND_LIMIT);
    expect(pushFake.sent.map((s) => s.endpoint)).toEqual([kids[1]!.endpoint]);
  });

  it("does not send what waited for one person to the next person on the same browser", async () => {
    const { t, course, kids } = await classWithPush(2);
    const [a, b] = [kids[0]!, kids[1]!];
    pushFake.status = 500;
    await publish(t, course.id, mixed());
    expect(await queued()).toBe(2);
    const idOf = async (endpoint: string) =>
      (await env.DB.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
        .bind(endpoint)
        .first<{ id: string }>())!.id;
    const before = await idOf(a.endpoint);
    // A signs out; B signs in on the same browser and turns push on there.
    await call("/api/auth/sign-out", { method: "POST", cookie: a.cookie });
    await enablePush(b, a.endpoint);
    expect(await idOf(a.endpoint)).not.toBe(before); // a new owner is a new row id

    pushFake.status = 201;
    pushFake.sent = [];
    await drainQueue(env, undefined, later(6));
    // A's message is not sent to the browser B now uses (B's own waited for the address B left, so it went too).
    expect(pushFake.sent).toEqual([]);
    expect(await queued()).toBe(0);
  });

  it("checks the person of a waiting push, not only the address", async () => {
    const { t, course, kids } = await classWithPush(2);
    const [a, b] = [kids[0]!, kids[1]!];
    pushFake.status = 500;
    await publish(t, course.id, mixed());
    // The address row moves to B but keeps its id (as an older version of the upsert did).
    await setSql(
      `UPDATE push_subscriptions SET user_id = ?, session_id = (SELECT session_id FROM push_subscriptions WHERE endpoint = ?)
       WHERE endpoint = ?`,
      b.userId,
      b.endpoint,
      a.endpoint,
    );
    await setSql("DELETE FROM push_subscriptions WHERE endpoint = ?", b.endpoint);
    pushFake.status = 201;
    pushFake.sent = [];
    await drainQueue(env, undefined, later(6));
    expect(pushFake.sent).toEqual([]);
    expect(await queued()).toBe(0);
  });

  it("drops a queued Telegram row left from before, without calling Telegram, even for a linked chat", async () => {
    const { kids } = await classWithPush(1);
    await linkTelegram(kids[0]!, 9400);
    telegramFake.asked = [];
    await setSql(
      `INSERT INTO outbound_queue (id, channel, user_id, target, content, created_at, tries, next_at)
       VALUES ('old-tg', 'telegram', ?, '9400', 'New homework', ?, 0, ?)`,
      kids[0]!.userId,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    expect(await queued()).toBe(1);
    await drainQueue(env, undefined, later(6));
    expect(telegramFake.asked).toEqual([]);
    expect(await queued()).toBe(0);
  });

  it("cuts a long text so the message always fits in one encrypted record", async () => {
    const receiver = await makeReceiver();
    const sub = {
      id: "s1",
      user_id: "u1",
      endpoint: "https://fcm.googleapis.com/fcm/send/long",
      p256dh: receiver.p256dh,
      auth: receiver.auth,
      language: "vi" as const,
    };
    const outcome = await sendPush(env, sub, {
      title: "Bài tập mới",
      body: "Tiếng Việt nâng cao ".repeat(400),
      link: "/my/work/1",
    });
    expect(outcome).toBe("sent");
    const got = await read(pushFake.sent[0]!, receiver);
    expect(got.title).toBe("Bài tập mới");
    expect(got.body.startsWith("Tiếng Việt nâng cao")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(got)).length).toBeLessThanOrEqual(3000);
  });
});
