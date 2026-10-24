import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { NOTICE_IDS, noticeIn } from "../src/lib/outbound-text";
import { runNotificationJobs } from "../src/notifications/jobs";
import { call, createCourse, createTeacher, type Person } from "./helpers";
import { fullAnswers, joinedKid, mixed, publish, submit } from "./homework";

// The words of every notification (bell and push), in both languages, exactly as the owner wrote them.

const setLang = (p: Person, language: "en" | "vi") =>
  env.DB.prepare("UPDATE users SET language = ? WHERE id = ?").bind(language, p.userId).run();
const bell = async (p: Person, kind: string) =>
  (
    (await call("/api/notifications", { cookie: p.cookie })).json.items as {
      kind: string;
      title: string;
      body: string;
    }[]
  )
    .filter((i) => i.kind === kind)
    .map((i) => ({ title: i.title, body: i.body }));
/** The same notification read in English and then in Vietnamese. */
async function both(p: Person, kind: string) {
  await setLang(p, "en");
  const en = await bell(p, kind);
  await setLang(p, "vi");
  const vi = await bell(p, kind);
  return { en, vi };
}

async function setup() {
  const t = await createTeacher("Lan Tran");
  const course = await createCourse(t, { name: "English A1", maxStudents: null });
  const hoa = await joinedKid(t, course.id, "Hoa");
  const w = await publish(t, course.id, mixed({ title: "Unit 1" }));
  return { t, course, hoa, id: w.id, qs: w.questions };
}
const setSql = (sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

describe("the new wording of each notification", () => {
  it("1 homework_new", async () => {
    const { hoa } = await setup();
    const r = await both(hoa, "homework_new");
    expect(r.en).toEqual([
      { title: "You have a new assignment!", body: "You have a new assignment from English A1." },
    ]);
    expect(r.vi).toEqual([
      { title: "Bạn có 1 bài tập mới!", body: "Bạn có 1 bài tập mới từ lớp English A1" },
    ]);
  });

  it("2 homework_due", async () => {
    const { hoa, id } = await setup();
    await setSql(
      "UPDATE assignments SET due_at = ? WHERE id = ?",
      new Date(Date.now() + 10 * 60_000).toISOString(),
      id,
    );
    await runNotificationJobs(env);
    const r = await both(hoa, "homework_due");
    expect(r.en).toEqual([
      {
        title: "Unit 1 is due soon",
        body: "Your assignment is due in 24 hours. Try to finish it early!",
      },
    ]);
    expect(r.vi).toEqual([
      {
        title: "Sắp đến hạn nộp bài Unit 1",
        body: "Bài tập của bạn sẽ đến hạn trong 24h nữa. Hãy hoàn thành sớm nhé!",
      },
    ]);
  });

  const overdue = async (allowLate: 0 | 1) => {
    const { hoa, id } = await setup();
    await setSql(
      "UPDATE assignments SET allow_late = ?, due_at = ? WHERE id = ?",
      allowLate,
      new Date(Date.now() - 30 * 60_000).toISOString(),
      id,
    );
    await runNotificationJobs(env);
    return both(hoa, "homework_overdue");
  };

  it("3a homework_overdue, late work allowed", async () => {
    const r = await overdue(1);
    expect(r.en).toEqual([
      {
        title: "Unit 1 is overdue!",
        body: "Your assignment is past its due date. Please hand it in as soon as you can!",
      },
    ]);
    expect(r.vi).toEqual([
      {
        title: "Bài Unit 1 đã quá hạn!",
        body: "Bài tập của bạn đã quá hạn. Hãy nhanh chóng nộp bài nhé!",
      },
    ]);
  });

  it("3b homework_overdue, late work not allowed", async () => {
    const r = await overdue(0);
    expect(r.en).toEqual([
      {
        title: "Unit 1 is overdue!",
        body: "Your assignment is past its due date and can no longer be handed in. Please contact your teacher for help!",
      },
    ]);
    expect(r.vi).toEqual([
      {
        title: "Bài Unit 1 đã quá hạn!",
        body: "Bài tập của bạn đã quá hạn và không thể nộp. Liên hệ với giáo viên để được hỗ trợ nhé!",
      },
    ]);
  });

  it("4 homework_returned and 5 homework_again", async () => {
    const { t, course, id, qs, hoa } = await setup();
    const nam = await joinedKid(t, course.id, "Nam");
    await submit(hoa, id, fullAnswers(qs));
    await submit(nam, id, fullAnswers(qs));
    await call(`/api/assignments/${id}/submissions/${hoa.studentId}/grade`, {
      method: "PUT",
      cookie: t.cookie,
      body: { points: { [qs[2]!.id]: 4, [qs[3]!.id]: 5 }, feedback: "", version: 1 },
    });
    await call(`/api/assignments/${id}/submissions/${hoa.studentId}/return`, {
      method: "POST",
      cookie: t.cookie,
      body: { version: 2 },
    });
    await call(`/api/assignments/${id}/submissions/${nam.studentId}/request-revision`, {
      method: "POST",
      cookie: t.cookie,
      body: { feedback: "More detail", version: 1 },
    });
    const returned = await both(hoa, "homework_returned");
    expect(returned.en).toEqual([
      { title: "Unit 1 has been marked", body: "Your results are ready. Tap to view." },
    ]);
    expect(returned.vi).toEqual([
      { title: "Bài Unit 1 đã được chấm", body: "Kết quả bài tập đã có. Bấm để kiểm tra." },
    ]);
    const again = await both(nam, "homework_again");
    expect(again.en).toEqual([
      {
        title: "Please revise Unit 1",
        body: "Your teacher has asked you to redo this assignment. Tap to view.",
      },
    ]);
    expect(again.vi).toEqual([
      {
        title: "Vui lòng chỉnh sửa bài Unit 1",
        body: "Giáo viên đã yêu cầu bạn làm lại bài. Bấm để kiểm tra.",
      },
    ]);
  });

  it("8 work_handed_in (to the teacher)", async () => {
    const { t, hoa, id, qs } = await setup();
    await submit(hoa, id, fullAnswers(qs));
    const r = await both(t, "work_handed_in");
    expect(r.en).toEqual([{ title: "Hoa handed in Unit 1", body: "Please check Hoa's work." }]);
    expect(r.vi).toEqual([
      { title: "Hoa đã nộp bài Unit 1", body: "Vui lòng kiểm tra bài tập của học sinh Hoa" },
    ]);
  });

  it("6 receipt_sent", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { pricePerLesson: 100_000, maxStudents: null });
    const kid = await joinedKid(t, course.id, "Hoa");
    const lesson = (
      await call(`/api/courses/${course.id}/lessons`, {
        method: "POST",
        cookie: t.cookie,
        body: {
          title: "L",
          date: "2020-01-06",
          startTime: "18:30",
          durationMinutes: 90,
          place: "",
          onlineUrl: null,
        },
      })
    ).json.lessons[0];
    await call(`/api/lessons/${lesson.id}/attendance`, {
      method: "PUT",
      cookie: t.cookie,
      body: { records: [{ studentId: kid.studentId, status: "attended" }] },
    });
    await call("/api/invoices/generate", { method: "POST", cookie: t.cookie, body: { period: "2020-01" } });
    const inv = (await call("/api/invoices?period=2020-01", { cookie: t.cookie })).json.invoices[0];
    await call(`/api/invoices/${inv.id}/send`, { method: "POST", cookie: t.cookie, body: { version: 1 } });
    const r = await both(kid, "receipt_sent");
    expect(r.en).toEqual([
      {
        title: "You have a new fee receipt!",
        body: "Your teacher has sent you a new fee receipt. Tap to view.",
      },
    ]);
    expect(r.vi).toEqual([
      {
        title: "Bạn có 1 phiếu thu học phí mới!",
        body: "Giáo viên đã gửi phiếu thu mới cho bạn. Bấm để kiểm tra.",
      },
    ]);
  });

  it("7 lesson_changed", async () => {
    const t = await createTeacher("Lan Tran");
    const course = await createCourse(t, { maxStudents: null });
    const kid = await joinedKid(t, course.id, "Mai");
    const made = await call(`/api/courses/${course.id}/lessons`, {
      method: "POST",
      cookie: t.cookie,
      body: {
        title: "L",
        date: "2026-10-05",
        startTime: "18:30",
        durationMinutes: 90,
        place: "",
        onlineUrl: null,
      },
    });
    const l = made.json.lessons[0];
    const res = await call(`/api/lessons/${l.id}`, {
      method: "PUT",
      cookie: t.cookie,
      body: {
        title: l.title,
        date: "2026-10-06",
        startTime: "19:00",
        durationMinutes: 90,
        place: l.place,
        onlineUrl: l.onlineUrl,
        version: l.version,
        scope: "this",
      },
    });
    expect(res.status).toBe(200);
    const r = await both(kid, "lesson_changed");
    expect(r.en).toEqual([
      { title: "Your lesson has been changed", body: "Your lesson has been updated. Tap to view." },
    ]);
    expect(r.vi).toEqual([
      { title: "Buổi học của bạn đã được thay đổi", body: "Buổi học đã được cập nhật. Bấm để kiểm tra." },
    ]);
  });
});

describe("notifications made before 2026-10-24", () => {
  const old = (kind: string, title: string, body: string) => noticeIn({ kind, title, body }, "vi");

  it("still translate to their old Vietnamese, not to a new pattern", () => {
    expect(old("work_handed_in", "Nam handed in work", "Unit 1 · English A1")).toEqual({
      title: "Nam đã nộp bài",
      body: "Unit 1 · English A1",
    });
    expect(old("homework_due", "Due soon: X", "English A1").title).toBe("Sắp đến hạn nộp: X");
    expect(old("homework_new", "New homework: X", "English A1").title).toBe("Bài tập mới: X");
    expect(old("homework_overdue", "Overdue: X. Please finish it soon.", "English A1").title).toBe(
      "Bài X đã quá hạn, hãy nhanh chóng hoàn thiện nhé.",
    );
    expect(
      old("homework_overdue", "Overdue and closed: X. Ask your teacher to open it again.", "English A1")
        .title,
    ).toBe("Bài X đã quá hạn và đã khoá nộp. Liên hệ với giáo viên để được mở nộp bài");
    expect(old("homework_returned", "Your work was scored: X", "English A1").title).toBe(
      "Bài của bạn đã được chấm điểm: X",
    );
    expect(old("homework_again", "Please change your work: X", "English A1").title).toBe(
      "Vui lòng chỉnh sửa bài: X",
    );
    expect(old("receipt_sent", "New fee receipt: 01/2020", "Lan").title).toBe(
      "Phiếu thu học phí mới: 01/2020",
    );
    expect(old("lesson_changed", "Your class time changed", "English A1 · now 2026-10-06 19:00")).toEqual({
      title: "Lịch học của bạn đã thay đổi",
      body: "English A1 · giờ mới 2026-10-06 19:00",
    });
  });

  it("keeps every table text a notification can hold in the table", () => {
    expect(NOTICE_IDS.work_handed_in.title).toContain("{name} handed in {title}");
  });
});
