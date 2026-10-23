import { b64url } from "../src/push/crypto";

// The receiver (browser) side of Web Push, so tests can read what the server sent.

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** A fresh browser subscription: its key pair and the base64url values the browser would hand over. */
export async function makeReceiver(): Promise<{
  keys: CryptoKeyPair;
  p256dh: string;
  auth: string;
  authBytes: Uint8Array;
}> {
  const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer);
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  return { keys, p256dh: b64url.encode(publicRaw), auth: b64url.encode(authBytes), authBytes };
}

/** The parts of an aes128gcm header (RFC 8188 section 2.1). */
export function readHeader(body: Uint8Array): { salt: Uint8Array; recordSize: number; keyId: Uint8Array } {
  const salt = body.slice(0, 16);
  const recordSize = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idLength = body[20] ?? 0;
  const keyId = body.slice(21, 21 + idLength);
  return { salt, recordSize, keyId };
}

/** Decrypts one aes128gcm Web Push body as the browser does (RFC 8291 section 3.4), padding removed. */
export async function decryptPayload(
  body: Uint8Array,
  receiver: CryptoKeyPair,
  auth: Uint8Array,
): Promise<Uint8Array> {
  const { salt, keyId } = readHeader(body);
  const record = body.slice(21 + keyId.length);

  const serverPublic = await crypto.subtle.importKey(
    "raw",
    keyId,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // The Workers types spell the field `$public`, but the runtime reads `public`.
  const ecdhParams = { name: "ECDH", public: serverPublic } as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, receiver.privateKey, 256));
  const receiverPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", receiver.publicKey)) as ArrayBuffer,
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), receiverPublic, keyId);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // The last record ends with the delimiter 0x02, then optional zero padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error("missing last-record delimiter");
  return padded.slice(0, end);
}

/** Checks an ES256 JWT against a base64url raw P-256 public key and returns its claims, or null if the signature is bad. */
export async function verifyVapidJwt(
  jwt: string,
  publicKey: string,
): Promise<Record<string, unknown> | null> {
  const [header = "", payload = "", signature = ""] = jwt.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    b64url.decode(publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64url.decode(signature),
    encoder.encode(`${header}.${payload}`),
  );
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(b64url.decode(payload)));
}

/** A VAPID key pair in the form the config holds it: base64url raw public point and private scalar. */
export async function makeVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: b64url.encode(publicRaw), privateKey: jwk.d as string };
}
