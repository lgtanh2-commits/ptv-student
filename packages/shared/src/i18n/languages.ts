export const LANGUAGES = ["vi", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "vi";

export function parseLanguage(value: unknown): Language | null {
  return LANGUAGES.find((l) => l === value) ?? null;
}

export function localeOf(lang: Language): "vi-VN" | "en-GB" {
  return lang === "vi" ? "vi-VN" : "en-GB";
}

/** One piece of English text (the id) with its text for each language. */
export interface ServerText {
  id: string;
  en: string;
  vi: string;
}
