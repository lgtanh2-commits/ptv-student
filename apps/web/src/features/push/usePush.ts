import type { PushCheck, PushStatus } from "@lms/shared";
import { onMounted, ref } from "vue";
import { api } from "@/api/client";
import { messages } from "@/messages";

export type PushState = "loading" | "hidden" | "unsupported" | "install" | "blocked" | "off" | "on";

const HINT_KEY = "push-hint-dismissed";

/** The server's public key arrives as base64url; the browser wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
}

/** iPhone and iPad only allow notifications for an app added to the home screen. */
function needsInstall(): boolean {
  if (!/iphone|ipad|ipod/i.test(navigator.userAgent)) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  return !standalone;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Browser notifications for this device: what state it is in, and turning it on or off. Logic only. */
export function usePush() {
  const state = ref<PushState>("loading");
  const busy = ref(false);
  const error = ref<string | null>(null);
  const hintDismissed = ref(false);
  let publicKey: string | null = null;

  try {
    hintDismissed.value = localStorage.getItem(HINT_KEY) === "1";
  } catch {
    // storage blocked: the hint simply shows each visit
  }

  async function load() {
    try {
      const status = await api<PushStatus>("/push/status");
      publicKey = status.publicKey;
      if (!status.enabled || !publicKey) return void (state.value = "hidden");
      if (needsInstall()) return void (state.value = "install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return void (state.value = "unsupported");
      }
      if (Notification.permission === "denied") return void (state.value = "blocked");
      const sub = await currentSubscription();
      if (!sub) return void (state.value = "off");
      const check = await api<PushCheck>("/push/check", { method: "POST", body: { endpoint: sub.endpoint } });
      state.value = check.subscribed ? "on" : "off";
    } catch {
      // cannot tell: the feature stays out of the way rather than showing a wrong state
      state.value = "hidden";
    }
  }

  async function enable() {
    if (busy.value || !publicKey) return;
    busy.value = true;
    error.value = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        state.value = permission === "denied" ? "blocked" : "off";
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameBytes(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
      state.value = "on";
    } catch (err) {
      error.value = err instanceof Error ? err.message : messages.common.somethingWrong;
    } finally {
      busy.value = false;
    }
  }

  async function disable() {
    if (busy.value) return;
    busy.value = true;
    error.value = null;
    try {
      const sub = await currentSubscription();
      if (sub) {
        await api("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      state.value = "off";
    } catch (err) {
      error.value = err instanceof Error ? err.message : messages.common.somethingWrong;
    } finally {
      busy.value = false;
    }
  }

  function dismissHint() {
    hintDismissed.value = true;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // storage blocked: dismissed for this visit only
    }
  }

  onMounted(load);
  return { state, busy, error, enable, disable, hintDismissed, dismissHint, load };
}
