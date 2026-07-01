import { describe, it, expect } from "vitest";
import { authenticate } from "../src/verify-entitlement";
import { TEST_PUBLIC_KEY_B64URL, mintToken } from "./keypair";

const PINNED = { ENTITLEMENT_PUBLIC_KEYS: TEST_PUBLIC_KEY_B64URL };

function req(authHeader?: string): Request {
  return new Request("https://example.com/v1/me", {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe("authenticate", () => {
  it("accepts a valid token and returns its sub as owner", async () => {
    const token = await mintToken({ v: 2, sub: "key:test", exp: Date.now() + 60_000 });
    const result = await authenticate(req(`Bearer ${token}`), PINNED);
    expect(result).toEqual({ ok: true, owner: "key:test" });
  });

  it("rejects a tampered signature (401)", async () => {
    const token = await mintToken({ v: 2, sub: "key:test", exp: Date.now() + 60_000 });
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    const result = await authenticate(req(`Bearer ${tampered}`), PINNED);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("rejects an expired token (401)", async () => {
    const token = await mintToken({ v: 2, sub: "key:test", exp: Date.now() - 1 });
    const result = await authenticate(req(`Bearer ${token}`), PINNED);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("rejects a missing bearer when configured (401)", async () => {
    const result = await authenticate(req(), PINNED);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("refuses (501) when no public key is pinned; never opens", async () => {
    const token = await mintToken({ v: 2, sub: "key:test", exp: Date.now() + 60_000 });
    const result = await authenticate(req(`Bearer ${token}`), {});
    expect(result).toEqual({ ok: false, status: 501 });
  });

  it("DEV_ALLOW_ALL accepts any bearer as the owner", async () => {
    const result = await authenticate(req("Bearer anything"), { DEV_ALLOW_ALL: "true" });
    expect(result).toEqual({ ok: true, owner: "dev:anything" });
  });
});
