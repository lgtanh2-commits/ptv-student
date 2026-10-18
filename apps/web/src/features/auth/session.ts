import type { MeResponse } from "@lms/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { ApiError, api } from "@/api/client";
import { rememberLanguage, storedLanguage } from "@/features/i18n/language";
import { language } from "@/messages";

/** Who is signed in. The server is the only source of truth; this is a copy for the screens. */
export const useSession = defineStore("session", () => {
  const me = ref<MeResponse | null>(null);
  const loaded = ref(false);

  /**
   * Reads who is signed in. Answers true when the account's language differs from the one this
   * page was built in and has been stored: the caller then opens its destination as a fresh page
   * (`openFresh`), so the next screen is built in the account's language. Reloading here instead
   * would reload the address the person is on, which on an email-link page is the used-up link.
   */
  async function load(force = false): Promise<boolean> {
    if (loaded.value && !force) return false;
    try {
      me.value = await api<MeResponse>("/me");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) me.value = null;
      else throw err;
    }
    loaded.value = true;
    return syncLanguage();
  }

  /**
   * The account's language wins over what this browser remembered. Stores it and says whether a
   * fresh page is needed, but only if the write really stuck: a browser that cannot store it would
   * otherwise reload forever.
   */
  function syncLanguage(): boolean {
    const wanted = me.value?.user.language;
    if (!wanted || wanted === language) return false;
    rememberLanguage(wanted);
    return storedLanguage() === wanted;
  }

  async function signOut() {
    await api("/auth/sign-out", { method: "POST" });
    me.value = null;
  }

  const isTeacher = computed(() => me.value?.memberships.some((m) => m.role === "teacher") ?? false);
  const isStudent = computed(() => me.value?.memberships.some((m) => m.role === "student") ?? false);

  return { me, loaded, load, signOut, isTeacher, isStudent };
});
