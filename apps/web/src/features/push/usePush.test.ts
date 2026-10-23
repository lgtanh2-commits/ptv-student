import { afterEach, describe, expect, it, vi } from "vitest";
import { usePush } from "./usePush";

// 65 bytes of 0..64, base64url, like the server's public key.
const BYTES = Uint8Array.from({ length: 65 }, (_, i) => i);
const KEY = Buffer.from(BYTES).toString("base64url");
const SUB_JSON = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

interface Setup {
  enabled?: boolean;
  ua?: string;
  standalone?: boolean;
  permission?: NotificationPermission;
  requested?: NotificationPermission;
  existing?: boolean;
  checked?: boolean;
  noPush?: boolean;
  touch?: number;
  oldKey?: boolean;
  checkFails?: boolean;
}

function setup(o: Setup = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  const order: string[] = [];
  const fetchOrder: string[] = [];
  const unsubscribe = vi.fn(async () => (order.push("browser"), true));
  const sub = {
    endpoint: SUB_JSON.endpoint,
    toJSON: () => SUB_JSON,
    unsubscribe,
    options: { applicationServerKey: o.oldKey ? new Uint8Array([1, 2, 3]).buffer : BYTES.buffer },
  };
  let current: typeof sub | null = o.existing ? sub : null;
  const subscribe = vi.fn(async () => (current = sub));
  const reg = { pushManager: { getSubscription: async () => current, subscribe } };
  const register = vi.fn(async () => reg);
  vi.stubGlobal("navigator", {
    userAgent: o.ua ?? "Mozilla/5.0 (Windows NT 10.0) Chrome/130",
    standalone: o.standalone,
    maxTouchPoints: o.touch ?? 0,
    serviceWorker: { register, ready: Promise.resolve(reg), getRegistration: async () => reg },
  });
  const requestPermission = vi.fn(async () => o.requested ?? "granted");
  vi.stubGlobal("Notification", { permission: o.permission ?? "default", requestPermission });
  vi.stubGlobal("window", {
    ...(o.noPush ? {} : { PushManager: class {} }),
    matchMedia: () => ({ matches: false }),
  });
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.endsWith("/push/unsubscribe")) order.push("server");
      fetchOrder.push(url.replace("/api", ""));
      if (url.endsWith("/push/status")) {
        return Response.json({ enabled: o.enabled ?? true, publicKey: o.enabled === false ? null : KEY });
      }
      if (url.endsWith("/push/check") && o.checkFails) throw new Error("offline");
      if (url.endsWith("/push/check")) return Response.json({ subscribed: o.checked ?? true });
      return Response.json({ ok: true });
    }),
  );
  return { calls, order, fetchOrder, subscribe, unsubscribe, requestPermission, register };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loaded() {
  vi.spyOn(console, "warn").mockImplementation(() => {}); // onMounted outside a component
  const p = usePush();
  await p.load();
  return p;
}

describe("usePush", () => {
  it("is hidden when the server has push off", async () => {
    setup({ enabled: false });
    expect((await loaded()).state.value).toBe("hidden");
  });

  it("asks iPhone users to add the app to the home screen first", async () => {
    setup({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari", noPush: true });
    expect((await loaded()).state.value).toBe("install");
  });

  it("treats an iPad that reports a Mac as an iPhone-like device", async () => {
    setup({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", touch: 5, noPush: true });
    expect((await loaded()).state.value).toBe("install");
  });

  it("is blocked when the browser denied notifications", async () => {
    setup({ permission: "denied" });
    expect((await loaded()).state.value).toBe("blocked");
  });

  it("is unsupported without push in the browser", async () => {
    setup({ noPush: true });
    expect((await loaded()).state.value).toBe("unsupported");
  });

  it("enables: asks permission only when pressed, subscribes with the server key, and sends the subscription", async () => {
    const s = setup();
    const p = await loaded();
    expect(p.state.value).toBe("off");
    expect(s.requestPermission).not.toHaveBeenCalled();

    await p.enable();
    expect(s.requestPermission).toHaveBeenCalledTimes(1);
    expect(s.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    const arg = (s.subscribe.mock.calls[0] as unknown[])[0] as {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    };
    expect(arg.userVisibleOnly).toBe(true);
    expect(Array.from(arg.applicationServerKey)).toEqual(Array.from(BYTES));
    const post = s.calls.find((c) => c.url.endsWith("/push/subscribe"));
    expect(post?.body).toEqual(SUB_JSON);
    expect(p.state.value).toBe("on");
  });

  it("stays off when the person does not allow notifications", async () => {
    const s = setup({ requested: "default" });
    const p = await loaded();
    await p.enable();
    expect(s.subscribe).not.toHaveBeenCalled();
    expect(p.state.value).toBe("off");
  });

  it("shows off, not on, when this browser's subscription belongs to another session", async () => {
    setup({ existing: true, checked: false });
    expect((await loaded()).state.value).toBe("off");
  });

  it("shows on when this session owns the browser's subscription", async () => {
    setup({ existing: true, checked: true });
    expect((await loaded()).state.value).toBe("on");
  });

  it("disables: tells the server, then unsubscribes the browser", async () => {
    const s = setup({ existing: true });
    const p = await loaded();
    expect(p.state.value).toBe("on");
    await p.disable();
    const idx = s.calls.findIndex((c) => c.url.endsWith("/push/unsubscribe"));
    expect(idx).toBeGreaterThan(-1);
    expect(s.calls[idx]?.body).toEqual({ endpoint: SUB_JSON.endpoint });
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
    const serverCall = s.fetchOrder.findIndex((x) => x === "/push/unsubscribe");
    expect(serverCall).toBeGreaterThan(-1);
    expect(s.order).toEqual(["server", "browser"]);
    expect(p.state.value).toBe("off");
  });

  it("replaces a subscription made with another key", async () => {
    const s = setup({ existing: true, checked: false, oldKey: true });
    const p = await loaded();
    await p.enable();
    expect(s.order).toEqual(["browser"]);
    const arg = (s.subscribe.mock.calls[0] as unknown[])[0] as { applicationServerKey: Uint8Array };
    expect(Array.from(arg.applicationServerKey)).toEqual(Array.from(BYTES));
    expect(p.state.value).toBe("on");
  });

  it("keeps the card as off with an error when the check fails", async () => {
    setup({ existing: true, checkFails: true });
    const p = await loaded();
    expect(p.state.value).toBe("off");
    expect(p.error.value).not.toBeNull();
  });

  it("remembers that the hint was dismissed", async () => {
    setup();
    const p = await loaded();
    expect(p.hintDismissed.value).toBe(false);
    p.dismissHint();
    expect(p.hintDismissed.value).toBe(true);
    expect((await loaded()).hintDismissed.value).toBe(true);
  });
});
