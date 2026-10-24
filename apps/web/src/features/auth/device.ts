/**
 * A short, readable name for a signed-in device, from the browser's user agent: "Chrome · macOS".
 * Only the browser and the system are kept; versions and the rest of the string are dropped. Returns null when
 * neither is recognised (the screen then shows a generic word), so a raw user agent is never shown.
 */
export function deviceName(userAgent: string | null): string | null {
  const ua = userAgent ?? "";
  const parts = [browserOf(ua), systemOf(ua)].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A rough guess of the kind of device, only to pick an icon. */
export function isPhone(userAgent: string | null): boolean {
  return /iphone|android|mobile/i.test(userAgent ?? "");
}

// The order matters: Edge, Opera and Samsung Internet also say "Chrome", and Chrome also says "Safari".
const browsers: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|HeadlessChrome|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

function browserOf(ua: string): string | null {
  return browsers.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

// iPads that ask for the desktop site say "Macintosh"; they read as macOS, which is what the person chose.
const systems: [RegExp, string][] = [
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\b(Macintosh|Mac OS X)\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function systemOf(ua: string): string | null {
  return systems.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}
