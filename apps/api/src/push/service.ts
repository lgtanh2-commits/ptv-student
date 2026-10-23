import type { PushCheck, PushStatus } from "@lms/shared";
import type { Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import type { Env } from "../env";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/id";
import { nowIso } from "../lib/time";
import { deleteOwnSubscriptionStatement, isSubscribed, upsertSubscriptionStatement } from "../repos/push";
import { b64url } from "./crypto";

/** Push needs both keys: the public one is given to the browser, the private one signs what the server sends. */
export const isPushOn = (env: Env): boolean => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

const MAX_ENDPOINT_LENGTH = 2048;

/**
 * Only real push services. The server will call this address later, so anything else (a private address, a
 * look-alike host, a port) would let a person make the server call somewhere it should not.
 */
export function isPushEndpoint(value: string): boolean {
  if (value.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "")
    return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com")
  );
}

function decodedLength(value: string): { length: number; first: number } | null {
  try {
    const bytes = b64url.decode(value);
    return { length: bytes.length, first: bytes[0] ?? -1 };
  } catch {
    return null;
  }
}

export const isValidP256dh = (value: string): boolean => {
  const d = decodedLength(value);
  return d !== null && d.length === 65 && d.first === 0x04;
};
export const isValidAuth = (value: string): boolean => decodedLength(value)?.length === 16;

export function status(env: Env): PushStatus {
  const enabled = isPushOn(env);
  return { enabled, publicKey: enabled ? (env.VAPID_PUBLIC_KEY ?? null) : null };
}

export async function subscribe(
  ctx: Ctx,
  actor: Actor,
  body: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  if (!isPushOn(ctx.env)) throw new AppError("NOT_FOUND");
  if (!isPushEndpoint(body.endpoint) || !isValidP256dh(body.keys.p256dh) || !isValidAuth(body.keys.auth))
    throw new AppError("VALIDATION_FAILED");
  await upsertSubscriptionStatement(ctx.env.DB, {
    id: uuidv7(),
    userId: actor.userId,
    sessionId: actor.sessionId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    createdAt: nowIso(),
  }).run();
}

export async function check(ctx: Ctx, actor: Actor, endpoint: string): Promise<PushCheck> {
  return { subscribed: await isSubscribed(ctx.env.DB, actor.userId, actor.sessionId, endpoint) };
}

export async function unsubscribe(ctx: Ctx, actor: Actor, endpoint: string): Promise<void> {
  await deleteOwnSubscriptionStatement(ctx.env.DB, actor.userId, endpoint).run();
}
