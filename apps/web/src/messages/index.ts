import type { Language } from "@lms/shared";
import { storedLanguage } from "@/features/i18n/language";
import { en, type Messages } from "./en";
import { vi } from "./vi";

/** The language this page loaded with. A change of language reloads the page, so it never changes. */
export const language: Language = storedLanguage();

/** The only place that knows which language is active. */
export const messages: Messages = language === "en" ? en : vi;
