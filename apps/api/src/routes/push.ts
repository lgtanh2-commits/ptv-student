import { pushEndpointBody, pushSubscribeBody } from "@lms/shared";
import { Hono } from "hono";
import { makeCtx } from "../auth/service";
import type { AppBindings } from "../env";
import { actorOf, requireAuth } from "../middleware/auth";
import { check, status, subscribe, unsubscribe } from "../push/service";
import { parseBody } from "./helpers";

export const push = new Hono<AppBindings>();

push.get("/push/status", requireAuth, (c) => c.json(status(c.env)));

push.post("/push/subscribe", requireAuth, async (c) => {
  const body = await parseBody(c, pushSubscribeBody);
  await subscribe(await makeCtx(c), actorOf(c), body);
  return c.json({ ok: true });
});

push.post("/push/check", requireAuth, async (c) => {
  const body = await parseBody(c, pushEndpointBody);
  return c.json(await check(await makeCtx(c), actorOf(c), body.endpoint));
});

push.post("/push/unsubscribe", requireAuth, async (c) => {
  const body = await parseBody(c, pushEndpointBody);
  await unsubscribe(await makeCtx(c), actorOf(c), body.endpoint);
  return c.json({ ok: true });
});
