export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT: "local" | "test" | "staging" | "production";
  /** "dev" stores emails in the outbox table. "smtp" sends them through an SMTP server (see docs/deploy.md). */
  EMAIL_MODE: "dev" | "smtp";
  /** SMTP server, for example smtp.gmail.com. Port 465 (TLS from the first byte) is the default. */
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  /** The account that signs in (an email address) and its password. Set both with `wrangler secret`. */
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** The "from" address, if different from SMTP_USER, and the name shown next to it. */
  SMTP_FROM?: string;
  SMTP_FROM_NAME?: string;
  /** Public address of the app, used in email links. Never taken from the request. */
  APP_URL: string;
  /** Secret used to hash IP addresses and emails in counters and logs. Set with `wrangler secret`. */
  HMAC_KEY?: string;
  /** Google sign in. Needs both, from a Google Cloud "OAuth client" (see docs/deploy.md). Without them Google is off. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "dev" replaces Google with a local stand-in page. Ignored (Google stays off) outside local and tests. */
  GOOGLE_MODE?: "dev";
  /** Cloudflare Turnstile secret. Required in staging and production. */
  TURNSTILE_SECRET?: string;
  /** A Telegram bot's token (from BotFather). Without it, Telegram notifications are hidden. */
  TELEGRAM_BOT_TOKEN?: string;
  /** The bot's @username, used to build the "open Telegram" link. Without it, Telegram notifications are hidden. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Checked against the header Telegram sends on every webhook call, so nobody else can call it. Required to use Telegram. */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Browser push (docs/deploy.md, "Push notifications"). The public key goes to browsers; the private key signs what the server sends. Needs both, else push is off. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** The Telegram chat that gets every new feedback (needs TELEGRAM_BOT_TOKEN too). Without it the owner is not told. */
  FEEDBACK_TELEGRAM_CHAT_ID?: string;
}

export interface Variables {
  requestId: string;
  actor: import("./auth/actor").Actor | null;
  /** The language to answer in. Set by the requestLanguage middleware (see middleware/language.ts). */
  language: import("@lms/shared").Language;
}

type Bindings = Env;

export type AppBindings = { Bindings: Env; Variables: Variables };

// Makes `env` from "cloudflare:workers" (used in tests) use the same type.
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {}
  }
}
