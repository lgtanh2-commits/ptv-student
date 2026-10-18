import type { Language } from "@lms/shared";
import { computed, ref } from "vue";
import { api } from "@/api/client";
import { language as pageLanguage, messages } from "@/messages";
import { rememberLanguage } from "./language";

interface Deps {
  /** The language the page shows now. */
  current?: Language;
  put?: (lang: Language) => Promise<unknown>;
  remember?: (lang: Language) => void;
  reload?: () => void;
  onError?: (message: string) => void;
}

/**
 * Changing the language: the person picks one, we save it on the server, keep it in this browser
 * and reload so the whole page shows the new language. On a failure nothing changes.
 */
export function useLanguageSetting(deps: Deps = {}) {
  const current = deps.current ?? pageLanguage;
  const put =
    deps.put ??
    ((lang: Language) =>
      api<{ language: Language }>("/me/language", { method: "PUT", body: { language: lang } }));
  const remember = deps.remember ?? rememberLanguage;
  const reload = deps.reload ?? (() => location.reload());
  const onError = deps.onError ?? (() => {});

  const chosen = ref<Language>(current);
  const changed = computed(() => chosen.value !== current);
  const saving = ref(false);

  async function save(): Promise<void> {
    if (saving.value || !changed.value) return;
    const lang = chosen.value;
    saving.value = true;
    try {
      await put(lang);
    } catch (err) {
      saving.value = false;
      onError(err instanceof Error ? err.message : messages.common.somethingWrong);
      return;
    }
    // Stays "saving" on success: the page reloads, and the loading state covers the gap.
    remember(lang);
    reload();
  }

  return { current, chosen, changed, saving, save };
}
