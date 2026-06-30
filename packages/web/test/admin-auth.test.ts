import { describe, it, expect } from "vitest";
import { adminErrorMessage, looksLikeToken } from "../src/lib/admin-auth";

describe("looksLikeToken", () => {
  it("treats a <b64url>.<b64url> envelope as a token", () => {
    expect(looksLikeToken("eyJ2IjoyfQ.c2ln")).toBe(true);
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(looksLikeToken("  eyJ2IjoyfQ.c2ln  ")).toBe(true);
  });

  it("treats a dotless secret as an access key", () => {
    expect(looksLikeToken("my-access-key-123")).toBe(false);
  });

  it("rejects a leading dot (empty payload half)", () => {
    expect(looksLikeToken(".c2ln")).toBe(false);
  });

  it("rejects a trailing dot (empty signature half)", () => {
    expect(looksLikeToken("eyJ2IjoyfQ.")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(looksLikeToken("")).toBe(false);
  });
});

describe("adminErrorMessage", () => {
  it("maps 401 to a re-sign-in message", () => {
    expect(adminErrorMessage(401)).toMatch(/sign in again/i);
  });

  it("maps 403 to a not-an-admin message naming ADMIN_OWNERS", () => {
    expect(adminErrorMessage(403)).toMatch(/ADMIN_OWNERS/);
  });

  it("maps 501 to a not-configured message", () => {
    expect(adminErrorMessage(501)).toMatch(/not configured/i);
  });

  it("maps 429 to a quota message", () => {
    expect(adminErrorMessage(429)).toMatch(/quota/i);
  });

  it("prefers the server error string for an unmapped status", () => {
    expect(adminErrorMessage(404, "submission not found")).toBe("submission not found");
  });

  it("falls back to a generic message when no server error is given", () => {
    expect(adminErrorMessage(500)).toBe("Request failed (HTTP 500).");
  });

  it("ignores a blank server error string", () => {
    expect(adminErrorMessage(400, "   ")).toBe("Request failed (HTTP 400).");
  });
});
