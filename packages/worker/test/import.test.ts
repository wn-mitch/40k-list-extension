import { describe, it, expect } from "vitest";
import type { SubmissionEnvelope } from "@40kdc-meta/shared";
import { planProjection } from "../src/import";
import { SAMPLE_LIST_TEXT } from "../../normalizer/src/fixtures";

function armyListCapture(text: string, eventId = "evt-1", playerId = "ply-1") {
  const body = {
    id: "al-1",
    armyListText: text,
    eventId,
    playerId,
    event: { id: eventId, name: "Test Open", eventDate: "2026-06-26T12:00:00.000Z" },
    player: {
      id: playerId,
      firstName: "Zelda",
      lastName: "Testington",
      faction: { id: "f", name: "Chaos Knights" },
      metrics: { placing: 3, wins: 4, losses: 1, draws: 0 },
    },
  };
  return {
    url: "https://newprod-api.bestcoastpairings.com/v1/armylists/al-1",
    method: "GET",
    status: 200,
    body,
    capturedAt: 1,
  };
}

function envelope(...captures: ReturnType<typeof armyListCapture>[]): SubmissionEnvelope {
  return {
    submitterId: "s1",
    capturedAt: 1,
    lists: [],
    captures,
    raw: { captures },
  };
}

describe("planProjection", () => {
  it("extracts and normalizes a captured army list into projection rows", async () => {
    const plan = await planProjection(envelope(armyListCapture(SAMPLE_LIST_TEXT)));
    expect(plan.lists).toHaveLength(1);

    const list = plan.lists[0];
    expect(list.ok).toBe(true);
    expect(list.factionId).toBe("chaos-knights");
    expect(list.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(list.units.length).toBeGreaterThan(0);
    expect(list.units.every((u) => u.resolved && u.unitId)).toBe(true);
    expect(list.units.some((u) => u.isWarlord)).toBe(true);
    expect(list.event?.bcpEventId).toBe("evt-1");
    expect(list.player?.bcpPlayerIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(list.coverage.totalUnits).toBe(list.units.length);
    expect(list.coverage.unresolvedUnits).toBe(0);
  });

  it("never persists the player display name (hash only)", async () => {
    const plan = await planProjection(envelope(armyListCapture(SAMPLE_LIST_TEXT)));
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("Zelda"); // player first name from BCP
    expect(serialized).not.toContain("Testington"); // player last name from BCP
    expect(plan.lists[0].player).not.toHaveProperty("name");
    // The player is represented only by an opaque hash.
    expect(plan.lists[0].player?.bcpPlayerIdHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores captures that are not army lists", async () => {
    const noise = {
      url: "https://newprod-api.bestcoastpairings.com/v1/gamesystems",
      method: "GET",
      status: 200,
      body: { data: [], nextKey: null },
      capturedAt: 1,
    };
    const env: SubmissionEnvelope = {
      submitterId: "s",
      capturedAt: 1,
      lists: [],
      captures: [noise],
      raw: { captures: [noise] },
    };
    expect((await planProjection(env)).lists).toHaveLength(0);
  });

  it("reads captures from raw when captures[] is absent (reprocessing path)", async () => {
    const e = envelope(armyListCapture(SAMPLE_LIST_TEXT));
    const plan = await planProjection({ raw: e.raw });
    expect(plan.lists).toHaveLength(1);
    expect(plan.lists[0].factionId).toBe("chaos-knights");
  });
});
