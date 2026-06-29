import { describe, it, expect } from "vitest";
import type { CapturedResponse } from "@40kdc-meta/shared";
import {
  getOrCreateSubmitterId,
  mintSubmitterId,
  type IdStore,
} from "../lib/submitter-id";
import { shouldCapture } from "../lib/capture-filter";
import { buildEnvelope } from "../lib/envelope";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function memoryStore(): IdStore {
  let value: string | null = null;
  return {
    get: async () => value,
    set: async (next) => {
      value = next;
    },
  };
}

describe("submitterId", () => {
  it("mints a v4 UUID", () => {
    expect(mintSubmitterId()).toMatch(UUID_RE);
  });

  it("mints once and returns the same id on subsequent calls", async () => {
    const store = memoryStore();
    const first = await getOrCreateSubmitterId(store);
    const second = await getOrCreateSubmitterId(store);
    expect(first).toMatch(UUID_RE);
    expect(second).toBe(first);
  });
});

describe("shouldCapture", () => {
  it("captures an army-list JSON response from the BCP API host", () => {
    expect(
      shouldCapture(
        "https://newprod-api.bestcoastpairings.com/v1/armylists/GY8OE5IsKi3E",
        "application/json; charset=utf-8",
      ),
    ).toBe(true);
  });

  it("captures event player standings", () => {
    expect(
      shouldCapture(
        "https://newprod-api.bestcoastpairings.com/v1/events/xW1yF0a9lBWa/players",
        "application/json",
      ),
    ).toBe(true);
  });

  it("ignores catalog endpoints (not data-bearing)", () => {
    expect(
      shouldCapture(
        "https://newprod-api.bestcoastpairings.com/v1/gamesystems?limit=100",
        "application/json",
      ),
    ).toBe(false);
  });

  it("ignores the web app host (only the API host is captured)", () => {
    expect(
      shouldCapture(
        "https://www.bestcoastpairings.com/v1/armylists/GY8OE5IsKi3E",
        "application/json",
      ),
    ).toBe(false);
  });

  it("ignores a lookalike suffix host", () => {
    expect(
      shouldCapture(
        "https://newprod-api.bestcoastpairings.com.evil.com/v1/armylists/x",
        "application/json",
      ),
    ).toBe(false);
  });

  it("ignores non-JSON responses", () => {
    expect(
      shouldCapture(
        "https://newprod-api.bestcoastpairings.com/v1/armylists/x",
        "text/html",
      ),
    ).toBe(false);
  });
});

describe("buildEnvelope", () => {
  it("produces a raw-passthrough envelope that round-trips through JSON", () => {
    const captures: CapturedResponse[] = [
      {
        url: "https://newprod-api.bestcoastpairings.com/v1/players?eventId=x",
        method: "GET",
        status: 200,
        body: { hello: "world" },
        capturedAt: 1,
      },
    ];
    const submitterId = "00000000-0000-4000-8000-000000000000";
    const envelope = buildEnvelope(submitterId, captures, 1234);

    expect(envelope).toEqual({
      submitterId,
      capturedAt: 1234,
      lists: [],
      captures,
      raw: { captures },
    });
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });
});
