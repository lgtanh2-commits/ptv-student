import { anonymousId as anonymousIdSchema, type PublicEventBody } from "@lms/shared";
import { language } from "@/messages";

/**
 * Product metrics for the welcome page (docs/superpowers/specs/2026-10-25-mixpanel-metrics-design.md). The browser
 * keeps a random id in local storage (no cookie) and reports a visit or a sign up click to our own API, which passes
 * it on to Mixpanel. The same id goes with the sign up, so a visit can be joined to the account made after it.
 */

const KEY = "lms.anon";

/** Kept for the page load: the same id even when the browser refuses local storage. */
let current: string | null = null;

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers, or a page not served over https.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This browser's anonymous id, made the first time it is needed. Never anything a person typed. */
export function anonymousId(): string {
  if (current) return current;
  try {
    const stored = localStorage.getItem(KEY);
    if (anonymousIdSchema.safeParse(stored).success) return (current = stored!);
  } catch {
    // No storage: the id below lasts for this page load only.
  }
  current = randomId();
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Same as above.
  }
  return current;
}

/**
 * The origin of the page the visitor came from ("https://www.google.com"), without its path or query, which can
 * hold private things. Nothing when there is none, or when it would not fit what the API accepts.
 */
export function referrerOrigin(referrer: string): string | undefined {
  try {
    const origin = new URL(referrer).origin;
    return origin !== "null" && origin.length <= 100 ? origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reports one event and does not wait. `keepalive` lets it finish while the page changes (a click on "Continue with
 * Google" leaves the page at once). A failure is ignored: metrics never get in the visitor's way.
 */
export function sendEvent(body: PublicEventBody): void {
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lms-client": "web", "x-lms-lang": language },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch itself failed (an old browser without keepalive support): nothing to do.
  }
}

/** A sign up button on the welcome page was pressed. */
export function signUpClicked(button: "email" | "google", place: "top" | "hero" | "bottom"): void {
  sendEvent({ event: "Sign Up Clicked", anonymousId: anonymousId(), button, place });
}
