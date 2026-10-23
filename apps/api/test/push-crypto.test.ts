import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, vapidHeader } from "../src/push/crypto";
import { decryptPayload, makeReceiver, makeVapidKeys, readHeader, verifyVapidJwt } from "./push";

const encoder = new TextEncoder();

describe("web push encryption", () => {
  it("encrypts so the browser can decrypt it", async () => {
    const receiver = await makeReceiver();
    const text = JSON.stringify({ title: "Bài tập quá hạn", body: "Nộp bài Toán trước 23:59" });
    const body = await encryptPayload(encoder.encode(text), receiver.p256dh, receiver.auth);

    const header = readHeader(body);
    expect(header.recordSize).toBe(4096);
    expect(header.keyId.length).toBe(65);
    expect(header.keyId[0]).toBe(0x04);

    const plain = await decryptPayload(body, receiver.keys, receiver.authBytes);
    expect(new TextDecoder().decode(plain)).toBe(text);
  });

  it("matches the worked example in RFC 8291 appendix A", async () => {
    const asPublic =
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const point = b64url.decode(asPublic);
    const jwk = {
      kty: "EC",
      crv: "P-256",
      x: b64url.encode(point.slice(1, 33)),
      y: b64url.encode(point.slice(33, 65)),
    };
    const ecdh = { name: "ECDH", namedCurve: "P-256" };
    const serverKeys = {
      publicKey: await crypto.subtle.importKey("jwk", jwk, ecdh, true, []),
      privateKey: await crypto.subtle.importKey(
        "jwk",
        { ...jwk, d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw" },
        ecdh,
        false,
        ["deriveBits"],
      ),
    } as CryptoKeyPair;

    const body = await encryptPayload(
      encoder.encode("When I grow up, I want to be a watermelon"),
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      "BTBZMqHH6r4Tts7J_aSIgg",
      { salt: b64url.decode("DGv6ra1nlYgDCS1FRnbzlw"), serverKeys },
    );
    expect(b64url.encode(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("gives a fresh salt and server key every time", async () => {
    const receiver = await makeReceiver();
    const plain = encoder.encode("same text");
    const a = await encryptPayload(plain, receiver.p256dh, receiver.auth);
    const b = await encryptPayload(plain, receiver.p256dh, receiver.auth);
    expect(b64url.encode(a.slice(0, 16))).not.toBe(b64url.encode(b.slice(0, 16)));
    expect(b64url.encode(readHeader(a).keyId)).not.toBe(b64url.encode(readHeader(b).keyId));
  });
});

describe("VAPID", () => {
  it("signs a VAPID token the public key verifies", async () => {
    const keys = await makeVapidKeys();
    const now = new Date("2026-10-23T08:00:00Z");
    const header = await vapidHeader(
      "https://fcm.googleapis.com/fcm/send/abc123",
      keys,
      "https://lms.test",
      now,
    );

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt = "", k] = match!;
    expect(k).toBe(keys.publicKey);

    const claims = await verifyVapidJwt(jwt, keys.publicKey);
    expect(claims).not.toBeNull();
    expect(claims!.aud).toBe("https://fcm.googleapis.com");
    expect(claims!.sub).toBe("https://lms.test");
    const exp = claims!.exp as number;
    const nowSec = Math.floor(now.getTime() / 1000);
    expect(exp).toBeGreaterThan(nowSec);
    expect(exp).toBeLessThanOrEqual(nowSec + 12 * 3600);
  });

  it("reuses the header for the same push service until an hour before it expires", async () => {
    const keys = await makeVapidKeys();
    const start = new Date("2026-10-23T08:00:00Z");
    const first = await vapidHeader(
      "https://updates.push.services.mozilla.com/wpush/v2/a",
      keys,
      "https://lms.test",
      start,
    );
    const later = new Date(start.getTime() + 10 * 3600 * 1000);
    const again = await vapidHeader(
      "https://updates.push.services.mozilla.com/wpush/v2/b",
      keys,
      "https://lms.test",
      later,
    );
    expect(again).toBe(first);

    const tooLate = new Date(start.getTime() + 11 * 3600 * 1000 + 1000);
    const fresh = await vapidHeader(
      "https://updates.push.services.mozilla.com/wpush/v2/c",
      keys,
      "https://lms.test",
      tooLate,
    );
    expect(fresh).not.toBe(first);
  });
});
