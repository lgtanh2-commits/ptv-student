import { fromBase64UrlBytes, toBase64Url, toBase64UrlText } from "../lib/crypto";

// Web Push message encryption (RFC 8291, "aes128gcm") and VAPID signing (RFC 8292),
// done with WebCrypto only so it runs inside the Worker.

const encoder = new TextEncoder();

/** base64url as the browser and the push services use it (no padding). */
export const b64url = {
  encode: toBase64Url,
  decode: fromBase64UrlBytes,
};

/** The record size we announce. One push message always fits in a single record. */
const RECORD_SIZE = 4096;

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

/**
 * Encrypts one push message for one browser subscription. `p256dh` and `auth` are the
 * base64url values from the browser's subscription. Every call uses a new random salt and
 * a new throwaway server key pair, unless a test passes its own. Returns the full request
 * body: the aes128gcm header (salt, record size, server public key) and one record.
 */
export async function encryptPayload(
  plain: Uint8Array,
  p256dh: string,
  auth: string,
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const receiverPublic = b64url.decode(p256dh);
  const authSecret = b64url.decode(auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const serverKeys =
    opts.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", serverKeys.publicKey)) as ArrayBuffer,
  );

  // The shared secret between our throwaway key and the browser's key.
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // The Workers types spell the field `$public`, but the runtime (and the standard) reads `public`.
  const ecdhParams = { name: "ECDH", public: receiverKey } as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, serverKeys.privateKey, 256));

  // Mix in the browser's auth secret, then derive the content key and nonce (RFC 8291 section 3.4).
  const keyInfo = concat(encoder.encode("WebPush: info\0"), receiverPublic, serverPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // A single record is also the last one, so it ends with the delimiter 0x02 and no extra padding.
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(plain, new Uint8Array([2]))),
  );

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  return concat(header, serverPublic, record);
}

/** How long a VAPID token is valid. Push services refuse anything over 24 hours. */
const TOKEN_LIFETIME_S = 12 * 3600;
/** A cached header is replaced this long before its token runs out. */
const REFRESH_BEFORE_S = 3600;

// Signed headers, kept for the life of the Worker so a batch of sends signs once per push service.
const headerCache = new Map<string, { header: string; exp: number }>();

/**
 * The `Authorization` header for one push request: `vapid t=<JWT>, k=<public key>`. The token
 * is signed with ES256 and names the push service's origin as its audience. `keys` are the
 * base64url VAPID keys: the 65-byte public point and the 32-byte private scalar.
 */
export async function vapidHeader(
  endpoint: string,
  keys: { publicKey: string; privateKey: string },
  subject: string,
  now: Date = new Date(),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const nowS = Math.floor(now.getTime() / 1000);
  // The key and subject are part of the cache key too, so a key change never reuses an old header.
  const cacheKey = `${keys.publicKey} ${subject} ${aud}`;
  const cached = headerCache.get(cacheKey);
  if (cached && nowS < cached.exp - REFRESH_BEFORE_S) return cached.header;

  const exp = nowS + TOKEN_LIFETIME_S;
  const unsigned = `${toBase64UrlText(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${toBase64UrlText(
    JSON.stringify({ aud, exp, sub: subject }),
  )}`;

  // WebCrypto cannot import a bare private scalar, so build a JWK from it and the public point.
  const point = b64url.decode(keys.publicKey);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: b64url.encode(point.slice(1, 33)),
      y: b64url.encode(point.slice(33, 65)),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto gives the raw r||s signature, which is exactly what ES256 expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoder.encode(unsigned)),
  );

  const header = `vapid t=${unsigned}.${b64url.encode(signature)}, k=${keys.publicKey}`;
  headerCache.set(cacheKey, { header, exp });
  return header;
}
