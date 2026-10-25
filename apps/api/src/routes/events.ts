import { publicEventBody } from "@lms/shared";
import { Hono } from "hono";
import { welcomeEvent } from "../analytics/events";
import { makeCtx } from "../auth/service";
import type { AppBindings } from "../env";
import { AppError } from "../lib/errors";
import { hit } from "../security/rate-limit";
import { parseBody } from "./helpers";

/** Visits and sign up clicks on the welcome page (product metrics). Anyone may send them, within a limit. */
export const events = new Hono<AppBindings>();

/** A welcome page sends one view and a click or two; this is far above what a real visitor needs. */
const EVENTS_PER_HOUR = 120;

events.post("/events", async (c) => {
  const ctx = await makeCtx(c);
  if (!(await hit(c.env.DB, `events:ip:${ctx.ipHash}`, EVENTS_PER_HOUR, 3600)).allowed) {
    throw new AppError("RATE_LIMITED");
  }
  const body = await parseBody(c, publicEventBody);
  await welcomeEvent(ctx, body, ctx.language);
  return c.body(null, 204);
});
