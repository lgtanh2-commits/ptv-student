import { HOMEWORK_IMAGE_MAX_BYTES } from "@lms/shared";
import { requireTeacherTenant, type Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import type { Env } from "../env";
import { AppError } from "../lib/errors";
import { workGet } from "../my/service";
import { authorize } from "../policy";
import { findAssignment, parseList, questionsOf } from "../repos/assignments";
import { findCourse } from "../repos/courses";
import { findSubmission } from "../repos/grading";
import { findMyWork } from "../repos/mywork";
import {
  claimUnusedImages,
  findHomeworkImage,
  finishImageDeletion,
  insertHomeworkImage,
  markHomeworkImageReady,
  type HomeworkImageRow,
} from "../repos/homework-images";
import { hit } from "../security/rate-limit";

function contentTypeOf(bytes: Uint8Array) {
  const startsWith = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

async function store(
  ctx: Ctx,
  actor: Actor,
  request: Request,
  scope: Pick<HomeworkImageRow, "tenant_id" | "course_id" | "assignment_id" | "student_id">,
) {
  const limit = await hit(ctx.env.DB, `homework-image:${actor.userId}`, 80, 3600);
  if (!limit.allowed) throw new AppError("RATE_LIMITED");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > HOMEWORK_IMAGE_MAX_BYTES) throw new AppError("TOO_LARGE");
  const contentType = contentTypeOf(new Uint8Array(bytes));
  if (!contentType || contentType !== request.headers.get("content-type")) {
    throw new AppError("VALIDATION_FAILED", { message: "Choose a JPG, PNG, or WebP image." });
  }
  const id = crypto.randomUUID();
  // Reserve the id in D1 first so cleanup can find an interrupted upload.
  await insertHomeworkImage(ctx.env.DB, {
    ...scope,
    id,
    user_id: actor.userId,
    content_type: contentType,
    check_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  });
  await ctx.env.HOMEWORK_IMAGES.put(id, bytes);
  await markHomeworkImageReady(ctx.env.DB, id);
  return { id };
}

export async function uploadTeacherImage(ctx: Ctx, actor: Actor, courseId: string, request: Request) {
  const tenantId = requireTeacherTenant(actor);
  authorize(actor, "assignment", "update", { tenantId });
  const course = await findCourse(ctx.env.DB, tenantId, courseId);
  if (!course) throw new AppError("NOT_FOUND");
  if (course.status === "archived") throw new AppError("CONFLICT");
  return store(ctx, actor, request, {
    tenant_id: tenantId,
    course_id: courseId,
    assignment_id: null,
    student_id: null,
  });
}

export async function uploadStudentImage(ctx: Ctx, actor: Actor, assignmentId: string, request: Request) {
  const row = await findMyWork(ctx.env.DB, actor.userId, assignmentId);
  if (!row) throw new AppError("NOT_FOUND");
  const work = await workGet(ctx, actor, assignmentId);
  if (!work.canEdit) throw new AppError("CONFLICT");
  return store(ctx, actor, request, {
    tenant_id: row.tenant_id,
    course_id: row.course_id,
    assignment_id: row.id,
    student_id: row.student_id,
  });
}

export async function readHomeworkImage(ctx: Ctx, actor: Actor, id: string, assignmentId?: string) {
  const db = ctx.env.DB;
  const image = await findHomeworkImage(db, id);
  if (!image) throw new AppError("NOT_FOUND");
  const teacher = actor.memberships.some((m) => m.tenantId === image.tenant_id && m.role === "teacher");

  if (image.assignment_id && image.student_id) {
    if (image.user_id === actor.userId) {
      const work = await findMyWork(db, actor.userId, image.assignment_id);
      if (work?.student_id !== image.student_id) throw new AppError("NOT_FOUND");
    } else {
      if (!teacher) throw new AppError("NOT_FOUND");
      const assignment = await findAssignment(db, image.tenant_id, image.assignment_id);
      if (!assignment) throw new AppError("NOT_FOUND");
      const submission = await findSubmission(db, image.tenant_id, image.assignment_id, image.student_id);
      const images = submission
        ? Object.values(JSON.parse(submission.submitted_images) as Record<string, string[]>).flat()
        : [];
      if (!images.includes(id)) {
        throw new AppError("NOT_FOUND");
      }
    }
  } else if (!teacher) {
    const work = assignmentId ? await findMyWork(db, actor.userId, assignmentId) : null;
    if (
      work?.tenant_id !== image.tenant_id ||
      work.course_id !== image.course_id ||
      !(
        parseList<string>(work.image_ids).includes(id) ||
        questionsOf(work).some((q) => q.imageIds?.includes(id))
      )
    ) {
      throw new AppError("NOT_FOUND");
    }
  }

  const object = await ctx.env.HOMEWORK_IMAGES.get(id);
  if (!object) throw new AppError("NOT_FOUND");
  return new Response(object.body, {
    headers: { "Content-Type": image.content_type, "Content-Length": String(object.size) },
  });
}

export async function cleanHomeworkImages(env: Env, now = new Date()) {
  const recheckAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const { results } = await claimUnusedImages(env.DB, now.toISOString(), recheckAt);
  const ids = results.filter((row) => row.deleting === 1).map(({ id }) => id);
  if (ids.length === 0) return;
  await env.HOMEWORK_IMAGES.delete(ids);
  await finishImageDeletion(env.DB, ids);
}
