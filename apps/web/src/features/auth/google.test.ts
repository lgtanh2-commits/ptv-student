import { ERROR_CODES, SERVER_TEXT } from "@lms/shared";
import { describe, expect, it } from "vitest";
import { devGoogleCode, errorFromAddress, googleStartUrl } from "./google";

describe("googleStartUrl", () => {
  it("keeps the person signed in by default", () => {
    expect(googleStartUrl({ intent: "sign-in" })).toBe(
      "/api/auth/google/start?intent=sign-in&keep=1&lang=vi",
    );
  });

  it("says when the device is shared", () => {
    expect(googleStartUrl({ intent: "sign-up", keep: false })).toBe(
      "/api/auth/google/start?intent=sign-up&keep=0&lang=vi",
    );
  });

  it("carries the page's language, so a new account starts in it", () => {
    const url = googleStartUrl({ intent: "sign-up" }, "en");
    expect(new URL(url, "https://x.test").searchParams.get("lang")).toBe("en");
    const vi = googleStartUrl({ intent: "invite", invite: "t" }, "vi");
    expect(new URL(vi, "https://x.test").searchParams.get("lang")).toBe("vi");
  });

  it("carries the browser's anonymous id when given one", () => {
    const url = googleStartUrl({ intent: "sign-up", anon: "0b7c2f4e-9a1d-4c3b" });
    expect(new URL(url, "https://x.test").searchParams.get("anon")).toBe("0b7c2f4e-9a1d-4c3b");
    expect(googleStartUrl({ intent: "sign-in" })).not.toContain("anon=");
  });

  it("carries the invite link, safely encoded", () => {
    const url = googleStartUrl({ intent: "invite", invite: "a-b_c&d=e" });
    expect(new URL(url, "https://x.test").searchParams.get("invite")).toBe("a-b_c&d=e");
  });
});

describe("errorFromAddress", () => {
  it("shows nothing when there is no problem", () => {
    expect(errorFromAddress(undefined)).toBeNull();
    expect(errorFromAddress("")).toBeNull();
    expect(errorFromAddress(null)).toBeNull();
  });

  it("explains the problems the Google trip can end with", () => {
    for (const code of ["GOOGLE_FAILED", "NOT_INVITED", "GOOGLE_ACCOUNT_CHANGED", "LINK_EXPIRED"]) {
      expect(errorFromAddress(code)).toMatch(/\w/);
    }
    expect(errorFromAddress("NOT_INVITED", "en")).toContain("invite");
  });

  it("shows the problem in the page's language", () => {
    const english = ERROR_CODES.NOT_INVITED.message;
    const row = SERVER_TEXT.find((t) => t.id === english);
    expect(row?.vi).toBeTruthy();
    expect(errorFromAddress("NOT_INVITED", "vi")).toBe(row?.vi);
    expect(errorFromAddress("NOT_INVITED", "en")).toBe(english);
    for (const code of ["GOOGLE_FAILED", "GOOGLE_ACCOUNT_CHANGED", "LINK_EXPIRED", "made-up"]) {
      expect(errorFromAddress(code, "vi")).not.toBe(errorFromAddress(code, "en"));
    }
  });

  it("uses the general message for anything it does not know", () => {
    const general = errorFromAddress("INTERNAL");
    expect(errorFromAddress("made-up")).toBe(general);
    expect(errorFromAddress("toString")).toBe(general); // not an inherited property
    expect(errorFromAddress(["GOOGLE_FAILED"])).toBe(general);
  });
});

describe("devGoogleCode", () => {
  it("holds the email and name, also with accents", () => {
    const code = devGoogleCode("hoa@example.com", "Hòa Nguyễn");
    expect(code.startsWith("dev.")).toBe(true);
    expect(code).not.toMatch(/[+/=]/);
    const b64 = code.slice(4).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) =>
      c.charCodeAt(0),
    );
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({
      email: "hoa@example.com",
      name: "Hòa Nguyễn",
    });
  });
});
