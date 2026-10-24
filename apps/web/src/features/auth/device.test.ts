import { describe, expect, it } from "vitest";
import { deviceName, isPhone } from "./device";

const ua = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  headless:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  operaLinux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

describe("deviceName", () => {
  it("names the browser and the system, without versions", () => {
    expect(deviceName(ua.chromeMac)).toBe("Chrome · macOS");
    expect(deviceName(ua.safariIphone)).toBe("Safari · iOS");
    expect(deviceName(ua.safariMac)).toBe("Safari · macOS");
    expect(deviceName(ua.firefoxWindows)).toBe("Firefox · Windows");
    expect(deviceName(ua.chromeAndroid)).toBe("Chrome · Android");
    expect(deviceName(ua.chromebook)).toBe("Chrome · ChromeOS");
  });

  it("is not fooled by browsers that also say Chrome or Safari", () => {
    expect(deviceName(ua.edgeWindows)).toBe("Edge · Windows");
    expect(deviceName(ua.samsungAndroid)).toBe("Samsung Internet · Android");
    expect(deviceName(ua.operaLinux)).toBe("Opera · Linux");
    expect(deviceName(ua.chromeIphone)).toBe("Chrome · iOS");
    expect(deviceName(ua.headless)).toBe("Chrome · macOS");
  });

  it("keeps what it knows, and gives null rather than a raw string when it knows nothing", () => {
    expect(deviceName("curl/8.4.0")).toBeNull();
    expect(deviceName("")).toBeNull();
    expect(deviceName(null)).toBeNull();
    expect(deviceName("SomeApp/1.0 (Windows NT 10.0)")).toBe("Windows");
  });
});

describe("isPhone", () => {
  it("recognises phones", () => {
    expect(isPhone(ua.safariIphone)).toBe(true);
    expect(isPhone(ua.chromeAndroid)).toBe(true);
    expect(isPhone(ua.chromeMac)).toBe(false);
    expect(isPhone(null)).toBe(false);
  });
});
