import { Hono } from "hono";
import { makeCtx } from "../auth/service";
import type { AppBindings } from "../env";
import { AppError } from "../lib/errors";
import { actorOf, requireAuth } from "../middleware/auth";
import { handleUpdate, isFromTelegram, requestLinkCode, status, unlink } from "../telegram/service";

export const telegram = new Hono<AppBindings>();

telegram.get("/telegram/status", requireAuth, async (c) => {
  return c.json(await status(await makeCtx(c), actorOf(c)));
});

telegram.post("/telegram/link-code", requireAuth, async (c) => {
  return c.json(await requestLinkCode(await makeCtx(c), actorOf(c)));
});

telegram.post("/telegram/unlink", requireAuth, async (c) => {
  await unlink(await makeCtx(c), actorOf(c));
  return c.json({ ok: true });
});

// Telegram itself calls this address (see docs/deploy.md, "Telegram notifications"). It is exempt from the
// usual CSRF checks (middleware/csrf.ts) and checks its own secret header instead.
telegram.post("/telegram/webhook", async (c) => {
  if (!isFromTelegram(c.env, c.req.header("x-telegram-bot-api-secret-token")))
    throw new AppError("NOT_FOUND");
  const body: unknown = await c.req.json().catch(() => null);
  if (body !== null) {
    await handleUpdate(c.env, body).catch((err) =>
      console.error(JSON.stringify({ msg: "telegram webhook failed", err: String(err) })),
    );
  }
  // Telegram only needs a 200 to consider the update delivered; anything else makes it retry.
  return c.json({ ok: true });
});
