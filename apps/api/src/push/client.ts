import type { Env } from "../env";
import { appUrl } from "../lib/config";
import type { PushSubscriptionRow } from "../repos/push";
import { encryptPayload, vapidHeader } from "./crypto";
import { isPushEndpoint } from "./service";

/** What a push message says: the same as the bell. */
export interface PushContent {
  title: string;
  body: string;
  link: string;
}

/** The push service keeps a message for a browser that is offline for up to a day. */
const TTL_SECONDS = 86_400;

/**
 * Well under the 4079 bytes one encrypted record can carry. Titles and bodies are short, but a long
 * course name in Vietnamese (3 bytes a letter) must still fit, so the body is cut until it does.
 */
const MAX_PAYLOAD_BYTES = 3000;
const MAX_TITLE_CHARS = 200;
const MAX_BODY_CHARS = 500;

const encoder = new TextEncoder();

/** Cuts by letters, not by UTF-16 units, so a letter is never split in half. */
const cut = (text: string, chars: number): string => {
  const letters = [...text];
  return letters.length <= chars ? text : `${letters.slice(0, chars - 1).join("")}…`;
};

function payload(content: PushContent): Uint8Array {
  const title = cut(content.title, MAX_TITLE_CHARS);
  let bodyChars = MAX_BODY_CHARS;
  for (;;) {
    const bytes = encoder.encode(
      JSON.stringify({ title, body: cut(content.body, bodyChars), link: content.link }),
    );
    if (bytes.length <= MAX_PAYLOAD_BYTES || bodyChars <= 1) return bytes;
    bodyChars = Math.floor(bodyChars / 2);
  }
}

/**
 * Sends one message to one browser through its push service. "gone" means the browser dropped the
 * subscription (404 or 410), so it should be removed; "failed" is worth trying again later. Never throws,
 * and never logs what the message said.
 */
export async function sendPush(
  env: Env,
  sub: PushSubscriptionRow,
  content: PushContent,
): Promise<"sent" | "gone" | "failed"> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return "failed";
  // Checked again here, because the server is about to call this address.
  if (!isPushEndpoint(sub.endpoint)) return "gone";
  let body: Uint8Array;
  try {
    body = await encryptPayload(payload(content), sub.p256dh, sub.auth);
  } catch {
    // The stored keys are not a real key (they passed the checks at subscribe, but are not a point on the
    // curve). That can never work, so the subscription is treated as gone, not tried again.
    console.error(JSON.stringify({ msg: "push subscription unusable" }));
    return "gone";
  }
  try {
    const authorization = await vapidHeader(sub.endpoint, { publicKey, privateKey }, appUrl(env));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: String(TTL_SECONDS),
        Urgency: "normal",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization: authorization,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    // The answer's body is never read or logged.
    await res.body?.cancel();
    if (res.ok) return "sent";
    if (res.status === 404 || res.status === 410) return "gone";
    console.error(JSON.stringify({ msg: "push send failed", status: res.status }));
    return "failed";
  } catch (err) {
    console.error(JSON.stringify({ msg: "push send failed", err: String(err) }));
    return "failed";
  }
}
