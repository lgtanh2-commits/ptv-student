import { DEFAULT_LANGUAGE, parseLanguage, type Language } from "@lms/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";

/** The header the web app sends with the language the person picked. */
export const LANGUAGE_HEADER = "x-lms-lang";

/**
 * The language the request asked for. The header is only ever compared with the known languages, so
 * anything else (a long string, "__proto__", "../") counts as missing and never goes further.
 */
export const headerLanguage = (c: Context<AppBindings>): Language | null =>
  parseLanguage(c.req.header(LANGUAGE_HEADER));

/**
 * The language to answer in, also for errors thrown before requestLanguage ran (too big, CSRF,
 * not found): what requestLanguage decided, otherwise the header, otherwise Vietnamese.
 */
export const languageOf = (c: Context<AppBindings>): Language =>
  c.get("language") ?? headerLanguage(c) ?? DEFAULT_LANGUAGE;

/**
 * Works out the language of the answer. Runs after loadActor: a signed in person gets the language of
 * their account, anyone else the one their browser sent, and Vietnamese when there is none.
 */
export const requestLanguage = createMiddleware<AppBindings>(async (c, next) => {
  c.set("language", c.get("actor")?.language ?? headerLanguage(c) ?? DEFAULT_LANGUAGE);
  await next();
});
