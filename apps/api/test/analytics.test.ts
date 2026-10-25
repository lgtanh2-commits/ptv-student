import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMaintenance } from "../src/maintenance/jobs";
import { newToken } from "../src/repos/tokens";
import {
  call,
  createStudent,
  createTeacher,
  googleSignIn,
  latestToken,
  mixpanelFake,
  uniqueEmail,
  type Person,
} from "./helpers";

const ON = { MIXPANEL_TOKEN: "test-token" };
const ANON1 = "11111111-2222-4333-8444-555555555551";
const ANON2 = "11111111-2222-4333-8444-555555555552";
const ANON3 = "11111111-2222-4333-8444-555555555553";
const ANON_G = "11111111-2222-4333-8444-5555555555a1";

interface TrackedEvent {
  event: string;
  properties: Record<string, unknown>;
}
interface ProfileUpdate {
  $token: string;
  $distinct_id: string;
  $set: Record<string, unknown>;
}

const tracked = (name?: string): TrackedEvent[] =>
  mixpanelFake.sent
    .filter((s) => s.path === "/track")
    .flatMap((s) => s.body as TrackedEvent[])
    .filter((e) => name === undefined || e.event === name);

const profiles = (): ProfileUpdate[] =>
  mixpanelFake.sent.filter((s) => s.path === "/engage").flatMap((s) => s.body as ProfileUpdate[]);

/** Signs a teacher up by email with Mixpanel switched on, without confirming. */
async function signUpTeacher(o: { name?: string; anonymousId?: string } = {}) {
  const email = uniqueEmail("teacher");
  const res = await call("/api/auth/sign-up", {
    method: "POST",
    env: ON,
    body: { name: o.name ?? "Ms Lan", email, ...(o.anonymousId ? { anonymousId: o.anonymousId } : {}) },
  });
  expect(res.status).toBe(202);
  return email;
}

async function confirm(email: string) {
  const res = await call("/api/auth/verify-email", {
    method: "POST",
    env: ON,
    body: { token: await latestToken(email, "verify_email") },
  });
  expect(res.status).toBe(200);
  return res;
}

const userIdOf = async (email: string) =>
  (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>())!.id;

async function inviteAndAccept(teacher: Person, email: string, name = "Sam") {
  const invited = await call("/api/invites", {
    method: "POST",
    cookie: teacher.cookie,
    body: { name, email },
  });
  expect(invited.status).toBe(202);
  const accepted = await call("/api/invites/accept", {
    method: "POST",
    env: ON,
    body: { token: await latestToken(email, "invite") },
  });
  expect(accepted.status).toBe(200);
  return accepted;
}

beforeEach(() => {
  mixpanelFake.sent = [];
  mixpanelFake.status = 200;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Mixpanel events", () => {
  it("sends nothing anywhere when no token is set", async () => {
    const off = { MIXPANEL_TOKEN: undefined };
    const email = uniqueEmail("teacher");
    await call("/api/auth/sign-up", { method: "POST", env: off, body: { name: "Ms Lan", email } });
    const verified = await call("/api/auth/verify-email", {
      method: "POST",
      env: off,
      body: { token: await latestToken(email, "verify_email") },
    });
    expect(verified.status).toBe(200);
    await call("/api/me", { cookie: verified.cookie, env: off });
    const t = await createTeacher();
    const studentEmail = uniqueEmail("kid");
    await call("/api/invites", {
      method: "POST",
      cookie: t.cookie,
      body: { name: "Sam", email: studentEmail },
    });
    await call("/api/invites/accept", {
      method: "POST",
      env: off,
      body: { token: await latestToken(studentEmail, "invite") },
    });
    expect(mixpanelFake.sent).toEqual([]);
  });

  it("sends Signed Up for a teacher only when the email is confirmed, with the sign-up's anonymous id", async () => {
    const email = await signUpTeacher({ anonymousId: ANON1 });
    expect(mixpanelFake.sent).toEqual([]);
    await confirm(email);
    const userId = await userIdOf(email);

    const signedUp = tracked("Signed Up");
    expect(signedUp).toHaveLength(1);
    expect(signedUp[0]!.properties).toMatchObject({
      token: "test-token",
      distinct_id: userId,
      $user_id: userId,
      $device_id: ANON1,
      $insert_id: `signed-up:${userId}`,
      role: "teacher",
      method: "email",
    });
    expect(typeof signedUp[0]!.properties.time).toBe("number");
    expect(profiles()).toEqual([
      {
        $token: "test-token",
        $distinct_id: userId,
        $set: expect.objectContaining({ is_teacher: true, $created: expect.any(String) }),
      },
    ]);

    // A second confirm link (made by hand: the app sends sign in links once the email is confirmed).
    mixpanelFake.sent = [];
    const { token, statement } = await newToken(env.DB, {
      kind: "verify_email",
      email,
      ttlMinutes: 60,
      userId,
    });
    await statement.run();
    const again = await call("/api/auth/verify-email", { method: "POST", env: ON, body: { token } });
    expect(again.status).toBe(200);
    expect(tracked("Signed Up")).toEqual([]);
    expect(profiles()).toEqual([]);
  });

  it("sends Signed Up without a device id when the sign up had no anonymous id", async () => {
    const email = await signUpTeacher();
    await confirm(email);
    const [event] = tracked("Signed Up");
    expect(event!.properties.$device_id).toBeUndefined();
  });

  it("sends Signed Up once for a student who accepts an invite, and Role Added when a teacher becomes a student", async () => {
    const t = await createTeacher();
    const studentEmail = uniqueEmail("kid");
    await inviteAndAccept(t, studentEmail);
    const studentId = await userIdOf(studentEmail);
    expect(tracked("Signed Up").map((e) => e.properties)).toEqual([
      expect.objectContaining({ distinct_id: studentId, role: "student", method: "invite" }),
    ]);
    expect(profiles()).toEqual([
      expect.objectContaining({
        $distinct_id: studentId,
        $set: expect.objectContaining({ is_student: true }),
      }),
    ]);

    // Another teacher invites the first teacher as a student.
    mixpanelFake.sent = [];
    const other = await createTeacher("Mr Binh");
    await inviteAndAccept(other, t.email, "Lan");
    expect(tracked("Signed Up")).toEqual([]);
    expect(tracked("Role Added").map((e) => e.properties)).toEqual([
      expect.objectContaining({
        distinct_id: t.userId,
        $user_id: t.userId,
        role: "student",
        $insert_id: `role-added:${t.userId}:student`,
      }),
    ]);
    expect(profiles()).toEqual([
      expect.objectContaining({ $distinct_id: t.userId, $set: { is_student: true } }),
    ]);
  });

  it("does not send anything for a second invite to someone who is already a student", async () => {
    const first = await createTeacher();
    const s = await createStudent(first);
    const second = await createTeacher("Mr Binh");
    mixpanelFake.sent = [];
    await inviteAndAccept(second, s.email);
    expect(tracked().filter((e) => e.event !== "App Opened")).toEqual([]);
    expect(profiles()).toEqual([]);
  });

  it("sends Signed Up for a Google sign-up with the anonymous id from the start of the trip", async () => {
    const email = uniqueEmail("gteacher");
    const trip = await googleSignIn({ email, intent: "sign-up", anon: ANON_G, env: ON });
    expect(trip.session).toBeDefined();
    const userId = await userIdOf(email);
    expect(tracked("Signed Up").map((e) => e.properties)).toEqual([
      expect.objectContaining({
        distinct_id: userId,
        $device_id: ANON_G,
        role: "teacher",
        method: "google",
      }),
    ]);
    // Signing in again with Google is not a new account.
    mixpanelFake.sent = [];
    await googleSignIn({ email, intent: "sign-in", env: ON });
    expect(tracked("Signed Up")).toEqual([]);
  });

  it("asks Mixpanel to check events (strict) and logs a rejected one", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mixpanelFake.status = 400;
    await confirm(await signUpTeacher());
    const track = mixpanelFake.sent.find((s) => s.path === "/track")!;
    expect(new URL(track.url).searchParams.get("strict")).toBe("1");
    expect(new URL(track.url).searchParams.get("ip")).toBe("0");
    expect(err.mock.calls.some((c) => String(c[0]).includes("mixpanel send failed"))).toBe(true);
    err.mockRestore();
  });

  it("clears the kept anonymous id once the email is confirmed", async () => {
    const email = await signUpTeacher({ anonymousId: ANON1 });
    const kept = () =>
      env.DB.prepare("SELECT signup_anon_id AS a FROM users WHERE email = ?")
        .bind(email)
        .first<{ a: string | null }>();
    expect((await kept())!.a).toBe(ANON1);
    await confirm(email);
    expect((await kept())!.a).toBeNull();
  });

  it("sends Signed Up (email) once when an unconfirmed email sign-up is confirmed by Google", async () => {
    const email = await signUpTeacher({ anonymousId: ANON1 });
    await googleSignIn({ email, intent: "sign-in", env: ON });
    const userId = await userIdOf(email);
    expect(tracked("Signed Up").map((e) => e.properties)).toEqual([
      expect.objectContaining({ distinct_id: userId, role: "teacher", method: "email", $device_id: ANON1 }),
    ]);
    mixpanelFake.sent = [];
    await googleSignIn({ email, intent: "sign-in", env: ON });
    expect(tracked("Signed Up")).toEqual([]);
  });

  it("sends Signed Up (email) once when an unconfirmed email sign-up accepts an invite", async () => {
    const email = await signUpTeacher({ anonymousId: ANON2 });
    const t = await createTeacher();
    await inviteAndAccept(t, email, "Lan");
    const userId = await userIdOf(email);
    expect(tracked("Signed Up").map((e) => e.properties)).toEqual([
      expect.objectContaining({ distinct_id: userId, role: "teacher", method: "email", $device_id: ANON2 }),
    ]);
    expect(tracked("Role Added")).toHaveLength(1);
  });

  it("sends Signed Up teacher and Role Added student for a Google sign-up with pending invites", async () => {
    const t = await createTeacher();
    const email = uniqueEmail("both");
    await call("/api/invites", { method: "POST", cookie: t.cookie, body: { name: "Sam", email } });
    mixpanelFake.sent = [];
    await googleSignIn({ email, intent: "sign-up", env: ON });
    const userId = await userIdOf(email);
    expect(tracked("Signed Up").map((e) => e.properties)).toEqual([
      expect.objectContaining({ distinct_id: userId, role: "teacher", method: "google" }),
    ]);
    expect(tracked("Role Added").map((e) => e.properties)).toEqual([
      expect.objectContaining({ distinct_id: userId, role: "student" }),
    ]);
  });

  it("sends App Opened once per person per Vietnam day", async () => {
    const t = await createTeacher();
    const me = () => call("/api/me", { cookie: t.cookie, env: ON });
    const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(`${day}T10:00:00Z`) }); // 17:00 in Vietnam

    await me();
    await me();
    vi.setSystemTime(Date.parse(`${day}T16:00:00Z`)); // 23:00 in Vietnam, same day
    await me();
    expect(tracked("App Opened")).toHaveLength(1);

    vi.setSystemTime(Date.parse(`${day}T17:30:00Z`)); // 00:30 the next day in Vietnam
    await me();
    vi.setSystemTime(Date.parse(`${day}T23:30:00Z`)); // 06:30, still that Vietnam day
    await me();
    vi.setSystemTime(Date.parse(`${next}T00:30:00Z`)); // past UTC midnight, 07:30 the same Vietnam day
    await me();

    const opened = tracked("App Opened").map((e) => e.properties);
    expect(opened).toEqual([
      expect.objectContaining({
        distinct_id: t.userId,
        $insert_id: `app-opened:${t.userId}:${day}`,
        is_teacher: true,
        is_student: false,
      }),
      expect.objectContaining({ distinct_id: t.userId, $insert_id: `app-opened:${t.userId}:${next}` }),
    ]);
  });

  it("never sends a name or an email", async () => {
    const email = await signUpTeacher({ name: "Nguyen Thi Lan", anonymousId: ANON2 });
    const verified = await confirm(email);
    await call("/api/me", { cookie: verified.cookie, env: ON });
    const teacher = await createTeacher("Tran Van Binh");
    const studentEmail = uniqueEmail("kid");
    await inviteAndAccept(teacher, studentEmail, "Le Minh Chau");
    await googleSignIn({ email: uniqueEmail("g"), name: "Pham Thu Ha", intent: "sign-up", env: ON });

    expect(mixpanelFake.sent.length).toBeGreaterThan(0);
    const all = JSON.stringify(mixpanelFake.sent.map((s) => s.body));
    for (const secret of [
      email,
      studentEmail,
      teacher.email,
      "Nguyen Thi Lan",
      "Le Minh Chau",
      "Pham Thu Ha",
    ]) {
      expect(all).not.toContain(secret);
    }
    expect(all).not.toContain("@");
  });

  it("an action still succeeds when Mixpanel fails", async () => {
    mixpanelFake.status = 500;
    const email = await signUpTeacher({ anonymousId: ANON3 });
    const verified = await confirm(email);
    expect(verified.cookie).toBeDefined();
    expect((await call("/api/me", { cookie: verified.cookie, env: ON })).status).toBe(200);
    expect(mixpanelFake.sent.length).toBeGreaterThan(0); // it was tried
  });

  it("keeps a sign up working when the anonymous id is not a valid one", async () => {
    const email = uniqueEmail("teacher");
    const res = await call("/api/auth/sign-up", {
      method: "POST",
      env: ON,
      body: { name: "Ms Lan", email, anonymousId: "x".repeat(500) },
    });
    expect(res.status).toBe(202);
    await confirm(email);
    expect(tracked("Signed Up")[0]!.properties.$device_id).toBeUndefined();
  });

  it("forgets the days people used the app after 400 days", async () => {
    const t = await createTeacher();
    const now = new Date("2026-10-25T05:00:00Z");
    for (const day of ["2025-09-19", "2025-09-21", "2026-10-25"]) {
      await env.DB.prepare("INSERT INTO user_active_days (user_id, day) VALUES (?, ?)")
        .bind(t.userId, day)
        .run();
    }
    await runMaintenance(env, now);
    const left = await env.DB.prepare("SELECT day FROM user_active_days WHERE user_id = ? ORDER BY day")
      .bind(t.userId)
      .all<{ day: string }>();
    expect(left.results.map((r) => r.day)).toEqual(["2025-09-21", "2026-10-25"]);
  });
});
