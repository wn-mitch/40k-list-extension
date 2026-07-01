/** TEST-ONLY Ed25519 keypair (same fixture as the keys service's test suite;
 *  never deployed; production pins the real key from keys.alpacasoft.dev). */
export const TEST_PRIVATE_KEY_PKCS8_B64 =
  "MC4CAQAwBQYDK2VwBCIEID7nr4UzKhzXovSzDkFt/COcOMpRY2M648hzS7YUp5Jn";
export const TEST_PUBLIC_KEY_B64URL = "aGUyp7LBUp9yhPI37WegLdkq34HCKbNiEZ1bhPnOMTo";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pkcs8Bytes(): Uint8Array {
  return Uint8Array.from(atob(TEST_PRIVATE_KEY_PKCS8_B64), (c) => c.charCodeAt(0));
}

/** Mint an Ed25519 entitlement token `base64url(json).base64url(sig)`. */
export async function mintToken(claims: {
  v: number;
  sub: string;
  exp: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Bytes(),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("Ed25519", key, enc.encode(payload)),
  );
  return `${payload}.${b64url(sig)}`;
}
