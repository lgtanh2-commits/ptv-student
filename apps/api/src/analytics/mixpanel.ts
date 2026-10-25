import type { Env } from "../env";

/**
 * Talks to Mixpanel (product metrics, project Tutorio). Only production has MIXPANEL_TOKEN, so everywhere else
 * both calls return at once and nothing leaves the Worker. They never throw and never slow anyone down: callers
 * run them through `ctx.defer`, a failure is logged without what was sent, and a slow Mixpanel is cut off.
 *
 * Only ids, fixed English words and times are ever sent: never a name, an email or anything a person typed.
 */

const API = "https://api.mixpanel.com";
const TIMEOUT_MS = 5000;

export interface MixpanelEvent {
  event: string;
  properties: Record<string, string | number | boolean>;
}

/**
 * `?ip=0`: Mixpanel must not take the Worker's address as the person's location. The answer's body is never read
 * or logged.
 */
async function post(path: "/track" | "/engage", body: unknown[]): Promise<void> {
  try {
    const res = await fetch(`${API}${path}?ip=0`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/plain" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.body?.cancel();
    if (!res.ok) console.error(JSON.stringify({ msg: "mixpanel send failed", status: res.status }));
  } catch (err) {
    console.error(JSON.stringify({ msg: "mixpanel send failed", err: String(err) }));
  }
}

/** Sends events. The project token goes into each event's properties, as Mixpanel wants it. */
export async function track(env: Env, events: MixpanelEvent[]): Promise<void> {
  const token = env.MIXPANEL_TOKEN;
  if (!token || events.length === 0) return;
  await post(
    "/track",
    events.map((e) => ({ event: e.event, properties: { ...e.properties, token } })),
  );
}

/** Sets properties on one person's profile (Mixpanel "People"), found by the app's user id. */
export async function setProfile(env: Env, userId: string, set: Record<string, unknown>): Promise<void> {
  const token = env.MIXPANEL_TOKEN;
  if (!token) return;
  await post("/engage", [{ $token: token, $distinct_id: userId, $set: set }]);
}
