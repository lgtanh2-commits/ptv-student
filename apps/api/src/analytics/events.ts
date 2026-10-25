import type { Language, PublicEventBody } from "@lms/shared";
import type { Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import { utcToLocal } from "../lib/zone";
import { markActiveDay, userCreatedAt } from "../repos/analytics";
import { setProfile, track, type MixpanelEvent } from "./mixpanel";

/**
 * The product events the app sends to Mixpanel (docs/superpowers/specs/2026-10-25-mixpanel-metrics-design.md).
 * Every one runs after the answer (`ctx.defer`), so it never slows down or breaks what the person is doing. People
 * are known by their user id only. Each event has a fixed `$insert_id`, so Mixpanel counts a repeat only once.
 */

type EventCtx = Pick<Ctx, "env" | "defer">;
export type Role = "teacher" | "student";
export type SignUpMethod = "email" | "google" | "invite";

/** "Used the app that day" is counted on the Vietnam calendar. */
const DAY_ZONE = "Asia/Ho_Chi_Minh";

/** The flag on the profile (and on App Opened) for a role. */
const flagOf = (role: Role) => (role === "teacher" ? "is_teacher" : "is_student");

/** Who an event is about: the user id, and the browser's anonymous id when known (simplified identity merge). */
function identity(userId: string, anonymousId?: string | null): Record<string, string> {
  return {
    distinct_id: userId,
    $user_id: userId,
    ...(anonymousId ? { $device_id: anonymousId } : {}),
  };
}

function event(name: string, insertId: string, properties: MixpanelEvent["properties"]): MixpanelEvent {
  return { event: name, properties: { ...properties, time: Date.now(), $insert_id: insertId } };
}

interface SignedUp {
  userId: string;
  role: Role;
  method: SignUpMethod;
  anonymousId?: string | null;
  createdAt: string;
}

const sendSignedUp = (env: EventCtx["env"], o: SignedUp) =>
  Promise.all([
    track(env, [
      event("Signed Up", `signed-up:${o.userId}`, {
        ...identity(o.userId, o.anonymousId),
        role: o.role,
        method: o.method,
      }),
    ]),
    setProfile(env, o.userId, { [flagOf(o.role)]: true, $created: o.createdAt }),
  ]);

/** An account came into being. Sends "Signed Up" and starts the person's profile. */
export async function signedUp(ctx: EventCtx, o: SignedUp): Promise<void> {
  if (!ctx.env.MIXPANEL_TOKEN) return;
  await ctx.defer(sendSignedUp(ctx.env, o));
}

/** An account that already existed got a new role (a teacher invited as a student). */
export async function roleAdded(ctx: EventCtx, o: { userId: string; role: Role }): Promise<void> {
  if (!ctx.env.MIXPANEL_TOKEN) return;
  await ctx.defer(
    Promise.all([
      track(ctx.env, [
        event("Role Added", `role-added:${o.userId}:${o.role}`, { ...identity(o.userId), role: o.role }),
      ]),
      setProfile(ctx.env, o.userId, { [flagOf(o.role)]: true }),
    ]),
  );
}

/**
 * A teacher's email sign up became real: the address was confirmed (by the link, or by Google or an invite to the
 * same address). `anonymousId` is the one kept from the sign up, read by the caller before confirming clears it.
 */
export async function emailSignUpConfirmed(
  ctx: EventCtx,
  userId: string,
  anonymousId: string | null,
): Promise<void> {
  if (!ctx.env.MIXPANEL_TOKEN) return;
  const db = ctx.env.DB;
  await ctx.defer(
    (async () => {
      const createdAt = await userCreatedAt(db, userId);
      await sendSignedUp(ctx.env, {
        userId,
        role: "teacher",
        method: "email",
        anonymousId,
        createdAt: createdAt ?? new Date().toISOString(),
      });
    })(),
  );
}

/**
 * A signed in request. The first one of the Vietnam day for this person sends "App Opened"; every other one only
 * finds the day already noted. Everything happens after the answer.
 */
export async function appOpened(ctx: EventCtx, actor: Actor): Promise<void> {
  if (!ctx.env.MIXPANEL_TOKEN) return;
  await ctx.defer(
    (async () => {
      const day = utcToLocal(new Date().toISOString(), DAY_ZONE).date;
      if (!(await markActiveDay(ctx.env.DB, actor.userId, day))) return;
      const roles = actor.memberships.map((m) => m.role);
      await track(ctx.env, [
        event("App Opened", `app-opened:${actor.userId}:${day}`, {
          ...identity(actor.userId),
          is_teacher: roles.includes("teacher"),
          is_student: roles.includes("student"),
        }),
      ]);
    })(),
  );
}

/** The host of the page the visitor came from ("www.google.com"), or nothing when it is not an address. */
function hostOf(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * An event the welcome page reported for an anonymous visitor (checked by `publicEventBody`). It is known by the
 * browser's anonymous id only, which `Signed Up` carries too, so Mixpanel joins the visit to the account later.
 */
export async function welcomeEvent(ctx: EventCtx, body: PublicEventBody, language: Language): Promise<void> {
  if (!ctx.env.MIXPANEL_TOKEN) return;
  // "$device:" is how Mixpanel names a visitor who is not signed in; the same id is the device id of Signed Up.
  const who = { distinct_id: `$device:${body.anonymousId}`, $device_id: body.anonymousId };
  let properties: MixpanelEvent["properties"];
  if (body.event === "Welcome Viewed") {
    const referrer = hostOf(body.referrer);
    properties = { ...who, ...(referrer ? { referrer } : {}), language };
  } else {
    properties = { ...who, button: body.button, place: body.place, language };
  }
  await ctx.defer(track(ctx.env, [{ event: body.event, properties: { ...properties, time: Date.now() } }]));
}
