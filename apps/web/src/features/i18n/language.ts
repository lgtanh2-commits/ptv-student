import { type Language, DEFAULT_LANGUAGE, parseLanguage } from "@lms/shared";

const KEY = "lms.lang";

/** The language this browser last used. Anything unexpected, or no local storage, gives the default. */
export function storedLanguage(): Language {
  try {
    return parseLanguage(localStorage.getItem(KEY)) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Keeps the language for the next page load. A browser that refuses to store it is fine. */
export function rememberLanguage(lang: Language): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // The language then stays what it was; nothing else depends on this write.
  }
}
