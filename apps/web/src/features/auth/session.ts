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

  async function load(force = false) {
    if (loaded.value && !force) return;
    try {
      me.value = await api<MeResponse>("/me");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) me.value = null;
      else throw err;
    }
    loaded.value = true;
    syncLanguage();
  }

  /**
   * The account's language wins over what this browser remembered. Reload once so every screen
   * is built in it, but only if the write really stuck: a browser that cannot store it would
   * otherwise reload forever.
   */
  function syncLanguage() {
    const wanted = me.value?.user.language;
    if (!wanted || wanted === language) return;
    rememberLanguage(wanted);
    if (storedLanguage() === wanted) location.reload();
  }

  async function signOut() {
    await api("/auth/sign-out", { method: "POST" });
    me.value = null;
  }

  const isTeacher = computed(() => me.value?.memberships.some((m) => m.role === "teacher") ?? false);
  const isStudent = computed(() => me.value?.memberships.some((m) => m.role === "student") ?? false);

  return { me, loaded, load, signOut, isTeacher, isStudent };
});
