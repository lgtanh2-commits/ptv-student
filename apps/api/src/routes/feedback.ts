import { feedbackBody } from "@lms/shared";
import { Hono } from "hono";
import { makeCtx } from "../auth/service";
import type { AppBindings } from "../env";
import { feedbackBoard, submitFeedback } from "../feedback/service";
import { actorOf, requireAuth } from "../middleware/auth";
import { parseBody } from "./helpers";

/** Any signed in person: sends feedback to the app owner, and reads the public board of what was accepted. */
export const feedback = new Hono<AppBindings>();

feedback.post("/feedback", requireAuth, async (c) => {
  const body = await parseBody(c, feedbackBody);
  await submitFeedback(await makeCtx(c), actorOf(c), body);
  return c.json({ ok: true }, 201);
});

feedback.get("/feedback/board", requireAuth, async (c) => {
  return c.json(await feedbackBoard(await makeCtx(c), actorOf(c)));
});
