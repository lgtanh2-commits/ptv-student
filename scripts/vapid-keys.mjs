// Prints a new VAPID key pair for browser push (see docs/deploy.md, "Push notifications").
// Both values are base64url: the public key is the raw 65 byte point, the private key the 32 byte scalar.
import { webcrypto } from "node:crypto";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${b64url(publicRaw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
