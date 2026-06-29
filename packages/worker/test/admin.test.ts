import { describe, it, expect } from "vitest";
import { parsePlayerConsent } from "../src/admin";

describe("parsePlayerConsent", () => {
  it("accepts opted_in with a display name", () => {
    const result = parsePlayerConsent({
      bcpPlayerId: "PLY_OPT",
      consent: "opted_in",
      displayName: "Ada",
    });
    expect(result).toEqual({
      bcpPlayerId: "PLY_OPT",
      consent: "opted_in",
      displayName: "Ada",
    });
  });

  it("trims the display name for opted_in", () => {
    const result = parsePlayerConsent({
      bcpPlayerId: "PLY_OPT",
      consent: "opted_in",
      displayName: "  Ada  ",
    });
    expect(result).toEqual({
      bcpPlayerId: "PLY_OPT",
      consent: "opted_in",
      displayName: "Ada",
    });
  });

  it("rejects opted_in without a display name", () => {
    expect(parsePlayerConsent({ bcpPlayerId: "PLY_OPT", consent: "opted_in" })).toHaveProperty(
      "error",
    );
  });

  it("rejects opted_in with an empty display name", () => {
    expect(
      parsePlayerConsent({ bcpPlayerId: "PLY_OPT", consent: "opted_in", displayName: "   " }),
    ).toHaveProperty("error");
  });

  it("purges any supplied name for excluded (identity-suppression)", () => {
    const result = parsePlayerConsent({
      bcpPlayerId: "PLY_OPT",
      consent: "excluded",
      displayName: "Should Be Ignored",
    });
    expect(result).toEqual({
      bcpPlayerId: "PLY_OPT",
      consent: "excluded",
      displayName: null,
    });
  });

  it("nulls the name for unknown", () => {
    const result = parsePlayerConsent({ bcpPlayerId: "PLY_OPT", consent: "unknown" });
    expect(result).toEqual({
      bcpPlayerId: "PLY_OPT",
      consent: "unknown",
      displayName: null,
    });
  });

  it("rejects a missing bcpPlayerId", () => {
    expect(parsePlayerConsent({ consent: "excluded" })).toHaveProperty("error");
  });

  it("rejects a blank bcpPlayerId", () => {
    expect(parsePlayerConsent({ bcpPlayerId: "   ", consent: "excluded" })).toHaveProperty(
      "error",
    );
  });

  it("rejects an invalid consent value", () => {
    expect(parsePlayerConsent({ bcpPlayerId: "PLY_OPT", consent: "maybe" })).toHaveProperty(
      "error",
    );
  });

  it("rejects a null body", () => {
    expect(parsePlayerConsent(null)).toHaveProperty("error");
  });
});
