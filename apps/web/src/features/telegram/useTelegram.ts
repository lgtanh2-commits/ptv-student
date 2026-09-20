import type { TelegramLinkCode, TelegramStatus } from "@lms/shared";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "@/api/client";

/** How often the page checks again after a code was asked for, so linking finishes without a manual refresh. */
const POLL_MS = 2500;
/** Stops checking after this long, matching how long a code stays good (LIMITS.telegramLinkMinutes, capped). */
const POLL_MAX_MS = 3 * 60_000;

/** Linking a Telegram chat to this person, so their notifications can also reach them there. Logic only. */
export function useTelegramLink() {
  const status = ref<TelegramStatus | null>(null);
  const deepLink = ref<string | null>(null);
  const loading = ref(true);
  const requesting = ref(false);
  const unlinking = ref(false);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollUntil = 0;

  const refresh = async () => (status.value = await api<TelegramStatus>("/telegram/status"));
  const stopPolling = () => clearTimeout(timer);

  async function poll() {
    if (Date.now() > pollUntil) return; // gave up quietly: the person can press the button again
    await refresh();
    if (status.value?.linked) deepLink.value = null;
    else timer = setTimeout(poll, POLL_MS);
  }

  async function load() {
    try {
      await refresh();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    } finally {
      loading.value = false;
    }
  }

  async function requestLink() {
    if (requesting.value) return;
    requesting.value = true;
    error.value = null;
    try {
      const res = await api<TelegramLinkCode>("/telegram/link-code", { method: "POST" });
      deepLink.value = res.deepLink;
      stopPolling();
      pollUntil = Date.now() + Math.min(POLL_MAX_MS, res.expiresInMinutes * 60_000);
      timer = setTimeout(poll, POLL_MS);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    } finally {
      requesting.value = false;
    }
  }

  async function unlink() {
    if (unlinking.value) return;
    unlinking.value = true;
    error.value = null;
    try {
      await api("/telegram/unlink", { method: "POST" });
      stopPolling();
      deepLink.value = null;
      await refresh();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    } finally {
      unlinking.value = false;
    }
  }

  onMounted(load);
  onBeforeUnmount(stopPolling);
  return { status, deepLink, loading, requesting, unlinking, error, requestLink, unlink };
}
