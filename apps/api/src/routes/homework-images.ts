import { HOMEWORK_IMAGE_MAX_BYTES, homeworkImageId } from "@lms/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { makeCtx } from "../auth/service";
import type { AppBindings } from "../env";
import { readHomeworkImage, uploadStudentImage, uploadTeacherImage } from "../homework-images/service";
import { AppError } from "../lib/errors";
import { actorOf, requireAuth, requireStudent, requireTeacher } from "../middleware/auth";

export const homeworkImages = new Hono<AppBindings>();

const limitImage = bodyLimit({
  maxSize: HOMEWORK_IMAGE_MAX_BYTES,
  onError: () => {
    throw new AppError("TOO_LARGE");
  },
});

homeworkImages.post("/courses/:id/homework-images", requireTeacher, limitImage, async (c) =>
  c.json(await uploadTeacherImage(await makeCtx(c), actorOf(c), c.req.param("id"), c.req.raw), 201),
);

homeworkImages.post("/my/work/:id/images", requireStudent, limitImage, async (c) =>
  c.json(await uploadStudentImage(await makeCtx(c), actorOf(c), c.req.param("id"), c.req.raw), 201),
);

homeworkImages.get("/homework-images/:id", requireAuth, async (c) =>
  readHomeworkImage(
    await makeCtx(c),
    actorOf(c),
    homeworkImageId.parse(c.req.param("id")),
    c.req.query("assignment"),
  ),
);
