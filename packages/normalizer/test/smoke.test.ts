import { describe, it, expect } from "vitest";
import { normalizeList, PARSER_VERSION } from "../src/index";
import { SAMPLE_LIST_TEXT, MISMATCHED_TOTAL_LIST_TEXT } from "../src/fixtures";
import type { BcpListCapture } from "@40kdc-meta/shared";

const capture = (listText: string): BcpListCapture => ({
  eventId: "evt-smoke",
  playerId: null,
  playerName: null,
  listText,
});

describe("normalizer smoke: proves @alpaca-software/40kdc-data integration end-to-end", () => {
  it("parses a pasted BCP list and resolves units to 40kdc entity IDs", async () => {
    const out = await normalizeList(capture(SAMPLE_LIST_TEXT));

    expect(out.ok).toBe(true);
    expect(out.format).toBe("newrecruit-simple");
    expect(out.faction_id).toBe("chaos-knights");

    // Every unit resolves to an entity id: the interoperability contract.
    expect(out.total_units).toBeGreaterThan(0);
    expect(out.resolved_units).toBe(out.total_units);
    expect(out.units.every((u) => u.resolved && u.unit_id)).toBe(true);
    expect(out.units.map((u) => u.unit_id)).toContain("war-dog-karnivore");

    // A warlord is identified and an enhancement is attached.
    expect(out.units.some((u) => u.is_warlord)).toBe(true);

    expect(out.parser_version).toBe(PARSER_VERSION);
  });

  it("a clean import carries matching totals and no warnings", async () => {
    const out = await normalizeList(capture(SAMPLE_LIST_TEXT));

    expect(out.points_reported).toBe(445);
    expect(out.points_computed).toBe(445);
    expect(out.points).toBe(445);
    expect(out.warnings).toEqual([]);
  });

  it("keeps a wrong as-pasted total distinct from the computed sum and flags it", async () => {
    const out = await normalizeList(capture(MISMATCHED_TOTAL_LIST_TEXT));

    expect(out.ok).toBe(true);
    // The headline prefers the as-pasted figure; the pair exposes the truth.
    expect(out.points).toBe(2000);
    expect(out.points_reported).toBe(2000);
    expect(out.points_computed).toBe(445);
    expect(out.warnings.map((w) => w.code)).toContain("points-mismatch");
  });

  it("emits a stable sha256 content hash for dedup", async () => {
    const a = await normalizeList(capture(SAMPLE_LIST_TEXT));
    const b = await normalizeList(capture(SAMPLE_LIST_TEXT));

    expect(a.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.content_hash).toBe(b.content_hash);
  });

  it("never throws on unparseable text; returns ok:false with a hash", async () => {
    const out = await normalizeList(capture("this is not an army list"));

    expect(out.ok).toBe(false);
    expect(out.units).toEqual([]);
    expect(out.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.points_reported).toBeNull();
    expect(out.points_computed).toBeNull();
    expect(out.declared_limit).toBeNull();
    expect(out.warnings).toEqual([]);
  });
});
