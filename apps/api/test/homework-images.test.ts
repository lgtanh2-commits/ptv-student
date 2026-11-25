import { HOMEWORK_IMAGE_MAX_BYTES } from "@lms/shared";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { cleanHomeworkImages } from "../src/homework-images/service";
import { app, call, createCourse, createTeacher, type Person } from "./helpers";
import { draft, homework, joinedKid, myWorkDetail, publish, submit, written } from "./homework";

const png = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII="),
  (char) => char.charCodeAt(0),
);

const upload = (person: Person, path: string, data = png, contentType = "image/png") =>
  app.request(
    `https://lms.test/api${path}`,
    {
      method: "POST",
      headers: { cookie: person.cookie, "x-lms-client": "web", "content-type": contentType },
      body: data,
    },
    env,
  );

const read = (id: string, person?: Person, assignment?: string) =>
  app.request(
    `https://lms.test/api/homework-images/${id}${assignment ? `?assignment=${assignment}` : ""}`,
    {
      headers: person ? { cookie: person.cookie } : {},
    },
    env,
  );

async function uploaded(person: Person, path: string) {
  const res = await upload(person, path);
  expect(res.status, res.status === 201 ? "" : await res.clone().text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe("homework photos", () => {
  it("shares a teacher's image only with students who can see the assignment", async () => {
    const teacher = await createTeacher();
    const otherTeacher = await createTeacher();
    const course = await createCourse(teacher);
    const otherCourse = await createCourse(teacher);
    const student = await joinedKid(teacher, course.id);
    const excluded = await joinedKid(teacher, course.id);
    const path = `/courses/${course.id}/homework-images`;
    const image = await uploaded(teacher, path);
    const firstPhoto = await uploaded(teacher, path);
    const secondPhoto = await uploaded(teacher, path);
    const questions = [
      { ...written("First question"), imageIds: [firstPhoto] },
      { ...written("Second question"), imageIds: [secondPhoto] },
    ];

    expect((await upload(teacher, path, png, "image/jpeg")).status).toBe(400);
    expect((await upload(teacher, path, new Uint8Array(HOMEWORK_IMAGE_MAX_BYTES + 1))).status).toBe(413);
    expect((await read(image)).status).toBe(401);
    expect((await read(image, otherTeacher)).status).toBe(404);
    expect((await read(image, student)).status).toBe(404);
    expect(
      (
        await call(`/api/courses/${otherCourse.id}/assignments`, {
          method: "POST",
          cookie: teacher.cookie,
          body: homework({ questions }),
        })
      ).status,
    ).toBe(409);

    const assignment = await publish(
      teacher,
      course.id,
      homework({
        imageIds: [image],
        questions,
        targetMode: "selected",
        studentIds: [student.studentId],
      }),
    );
    const { work } = (await myWorkDetail(student, assignment.id)).json;
    expect(work.imageIds).toEqual([image]);
    expect(work.questions.map((q: { imageIds?: string[] }) => q.imageIds)).toEqual([
      [firstPhoto],
      [secondPhoto],
    ]);
    expect((await read(firstPhoto, student, assignment.id)).status).toBe(200);
    expect((await read(firstPhoto, excluded, assignment.id)).status).toBe(404);
    expect((await read(image, excluded, assignment.id)).status).toBe(404);
    const result = await read(image, student, assignment.id);
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/png");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);

    expect((await draft(student, assignment.id, [])).status).toBe(200);
    const { assignment: current } = (
      await call(`/api/assignments/${assignment.id}`, { cookie: teacher.cookie })
    ).json;
    const edit = await call(`/api/assignments/${assignment.id}`, {
      method: "PUT",
      cookie: teacher.cookie,
      body: homework({
        version: current.version,
        targetMode: "selected",
        studentIds: [student.studentId],
        questions: [
          { ...questions[0], id: assignment.questions[0]!.id, imageIds: [] },
          { ...written("Second question"), id: assignment.questions[1]!.id },
        ],
      }),
    });
    expect(edit.status, JSON.stringify(edit.json)).toBe(200);
    expect(edit.json.assignment.imageIds).toEqual([image]);
    expect(edit.json.assignment.questions[1].imageIds).toEqual([secondPhoto]);
    expect((await read(firstPhoto, student, assignment.id)).status).toBe(404);
    const unused = await uploaded(teacher, path);
    await cleanHomeworkImages(env, new Date(Date.now() + 3 * 86_400_000));
    expect(await env.HOMEWORK_IMAGES.head(unused)).toBeNull();
    expect(await env.HOMEWORK_IMAGES.head(image)).not.toBeNull();
    expect(await env.HOMEWORK_IMAGES.head(firstPhoto)).toBeNull();
    expect(await env.HOMEWORK_IMAGES.head(secondPhoto)).not.toBeNull();
  });

  it("keeps draft photos private and shows each submitted version to the teacher", async () => {
    const teacher = await createTeacher();
    const course = await createCourse(teacher);
    const student = await joinedKid(teacher, course.id);
    const peer = await joinedKid(teacher, course.id);
    const assignment = await publish(teacher, course.id);
    const path = `/my/work/${assignment.id}/images`;
    const image = await uploaded(student, path);
    const answer = (id: string) => [{ questionId: assignment.questions[0]!.id, imageIds: [id] }];
    const grading = `/api/assignments/${assignment.id}/submissions/${student.studentId}`;

    expect((await draft(peer, assignment.id, answer(image))).status).toBe(409);
    const saved = await draft(student, assignment.id, answer(image));
    expect(saved.status).toBe(200);
    expect(saved.json.work.answers[0].imageIds).toEqual([image]);
    expect((await read(image, teacher)).status).toBe(404);
    expect((await read(image, peer, assignment.id)).status).toBe(404);
    expect((await submit(student, assignment.id, answer(image))).status).toBe(200);
    expect((await read(image, teacher)).status).toBe(200);
    expect((await upload(student, path)).status).toBe(409);

    const first = await call(grading, { cookie: teacher.cookie });
    expect(first.json.submission.answers[0].imageIds).toEqual([image]);
    const revision = await call(`${grading}/request-revision`, {
      method: "POST",
      cookie: teacher.cookie,
      body: { version: first.json.submission.version, feedback: "Try another approach." },
    });
    expect(revision.status).toBe(200);
    const updated = await uploaded(student, path);
    expect((await draft(student, assignment.id, answer(updated))).status).toBe(200);
    expect((await read(image, teacher)).status).toBe(200);
    expect((await read(updated, teacher)).status).toBe(404);
    expect((await submit(student, assignment.id, answer(updated))).status).toBe(200);
    expect((await read(image, teacher)).status).toBe(404);
    expect((await read(updated, teacher)).status).toBe(200);
  });
});
