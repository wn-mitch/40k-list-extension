// Route-level integration tests: the real worker fetch handler against real
// (local, per-test-isolated) D1 + R2 bindings inside workerd. The schema is the
// production one (migrations applied in ./apply-migrations.ts).
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import type { SubmissionEnvelope } from "@40kdc-meta/shared";
import worker, { type Env } from "../src/index";
import { setProjectionError } from "../src/import";
import { SAMPLE_LIST_TEXT, MISMATCHED_TOTAL_LIST_TEXT } from "../../normalizer/src/fixtures";

// The pool shares one miniflare instance across a file, so isolate tests by
// hand: wipe every table (children before parents) and the R2 bucket.
beforeEach(async () => {
  const tables = [
    "list_units",
    "list_sources",
    "coverage",
    "lists",
    "submissions",
    "submitters",
    "events",
    "players",
    "api_usage",
  ];
  for (const t of tables) await env.DB.prepare(`DELETE FROM ${t}`).run();
  const objects = await env.RAW.list();
  if (objects.objects.length > 0) {
    await env.RAW.delete(objects.objects.map((o) => o.key));
  }
});

/** Worker env over the test bindings; vars default to unset (production-safe). */
function testEnv(vars: Partial<Env> = {}): Env {
  return { DB: env.DB, RAW: env.RAW, ...vars };
}

/** Admin-capable env: DEV_ALLOW_ALL maps bearer "admin" to owner "dev:admin". */
function adminEnv(vars: Partial<Env> = {}): Env {
  return testEnv({ DEV_ALLOW_ALL: "true", ADMIN_OWNERS: "dev:admin", ...vars });
}

function armyListCapture(text: string, id = "al-1", eventId = "evt-1", playerId = "ply-1") {
  return {
    url: `https://newprod-api.bestcoastpairings.com/v1/armylists/${id}`,
    method: "GET",
    status: 200,
    body: {
      id,
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
    },
    capturedAt: 1,
  };
}

function envelope(
  submitterId: string,
  ...captures: ReturnType<typeof armyListCapture>[]
): SubmissionEnvelope {
  return { submitterId, capturedAt: 1, lists: [], captures, raw: { captures } };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://test.local${path}`, { headers });
}

async function ingest(e: Env, envl: SubmissionEnvelope): Promise<Response> {
  return worker.fetch(post("/ingest", envl), e);
}

describe("POST /ingest", () => {
  it("accepts a capture, retains raw in R2, and projects the list into D1", async () => {
    const e = testEnv();
    const res = await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT)));
    expect(res.status).toBe(202);

    const body = (await res.json()) as {
      ok: boolean;
      submissionId: string;
      duplicate: boolean;
      rawKey: string;
      projected: { lists: number; newLists: number } | null;
    };
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(false);
    expect(body.projected).toMatchObject({ lists: 1, newLists: 1 });

    // Raw payload is retained verbatim in R2.
    expect(await env.RAW.get(body.rawKey)).not.toBeNull();

    // The submission landed accepted with no projection error.
    const sub = await env.DB.prepare("SELECT status, projection_error FROM submissions WHERE id = ?")
      .bind(body.submissionId)
      .first<{ status: string; projection_error: string | null }>();
    expect(sub).toMatchObject({ status: "accepted", projection_error: null });

    // The projected list carries the diagnostics columns and the extracted text
    // is retained in R2 under its content hash.
    const list = await env.DB.prepare(
      "SELECT points, points_reported, points_computed, warnings, content_hash, raw_text_r2_key FROM lists",
    ).first<{
      points: number;
      points_reported: number;
      points_computed: number;
      warnings: string;
      content_hash: string;
      raw_text_r2_key: string;
    }>();
    expect(list).not.toBeNull();
    expect(list!.points_reported).toBe(445);
    expect(list!.points_computed).toBe(445);
    expect(JSON.parse(list!.warnings)).toEqual([]);
    expect(list!.raw_text_r2_key).toBe(`text/${list!.content_hash}.txt`);
    expect(await env.RAW.get(list!.raw_text_r2_key)).not.toBeNull();
  });

  it("is idempotent per (submitter, payload)", async () => {
    const e = testEnv();
    const envl = envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT));
    expect((await ingest(e, envl)).status).toBe(202);

    const dup = await ingest(e, envl);
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ ok: true, duplicate: true, submissionId: null });
  });

  it("rejects a malformed envelope with 400", async () => {
    const e = testEnv();
    expect((await ingest(e, { nope: true } as unknown as SubmissionEnvelope)).status).toBe(400);
    expect((await worker.fetch(post("/ingest", "not json at all"), e)).status).toBe(400);
  });

  it("rejects a blocked submitter with 403", async () => {
    const e = testEnv();
    await env.DB.prepare(
      "INSERT INTO submitters (id, install_key_hash, first_seen, blocked, blocked_reason) VALUES ('bad', 'bad', 0, 1, 'test')",
    ).run();
    const res = await ingest(e, envelope("bad", armyListCapture(SAMPLE_LIST_TEXT)));
    expect(res.status).toBe(403);
  });

  it("enforces the per-submitter daily ingest cap", async () => {
    const e = testEnv({ MAX_INGESTS_PER_DAY: "2" });
    // Distinct payloads so dedup doesn't short-circuit the counter.
    expect((await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT, "a")))).status).toBe(202);
    expect((await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT, "b")))).status).toBe(202);
    expect((await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT, "c")))).status).toBe(429);
  });
});

describe("GET /public/*", () => {
  it("serves accepted lists with the points provenance and warning fields", async () => {
    const e = testEnv();
    await ingest(e, envelope("sub-1", armyListCapture(MISMATCHED_TOTAL_LIST_TEXT)));

    const listsRes = await worker.fetch(get("/public/lists"), e);
    expect(listsRes.status).toBe(200);
    const lists = (await listsRes.json()) as { data: Record<string, unknown>[] };
    expect(lists.data).toHaveLength(1);
    expect(lists.data[0]).toMatchObject({
      points: 2000,
      pointsReported: 2000,
      pointsComputed: 445,
      warningCount: 1,
    });

    const detailRes = await worker.fetch(get(`/public/lists/${lists.data[0].id}`), e);
    const detail = (await detailRes.json()) as {
      list: { warnings: { code: string }[]; units: unknown[] };
    };
    expect(detail.list.warnings.map((w) => w.code)).toContain("points-mismatch");
    expect(detail.list.units.length).toBeGreaterThan(0);
  });

  it("hides lists whose only submission is quarantined", async () => {
    const e = testEnv();
    const res = await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT)));
    const { submissionId } = (await res.json()) as { submissionId: string };

    await env.DB.prepare("UPDATE submissions SET status = 'quarantined' WHERE id = ?")
      .bind(submissionId)
      .run();

    const lists = (await (await worker.fetch(get("/public/lists"), e)).json()) as {
      data: unknown[];
    };
    expect(lists.data).toHaveLength(0);
  });

  it("rate-limits the anonymous tier per client IP", async () => {
    const e = testEnv({ MAX_PUBLIC_QUERIES_PER_DAY: "2" });
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    expect((await worker.fetch(get("/public/lists", ip), e)).status).toBe(200);
    expect((await worker.fetch(get("/public/lists", ip), e)).status).toBe(200);
    expect((await worker.fetch(get("/public/lists", ip), e)).status).toBe(429);
    // A different IP is unaffected.
    expect(
      (await worker.fetch(get("/public/lists", { "cf-connecting-ip": "203.0.113.8" }), e)).status,
    ).toBe(200);
  });
});

describe("GET /v1/*", () => {
  it("refuses with 501 when no signer is pinned", async () => {
    const res = await worker.fetch(get("/v1/lists", { authorization: "Bearer whatever" }), testEnv());
    expect(res.status).toBe(501);
  });

  it("rejects a bad bearer with 401 when a signer is pinned", async () => {
    // A structurally-valid but unverifiable pinned key: nothing can authenticate.
    const e = testEnv({ ENTITLEMENT_PUBLIC_KEYS: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    expect((await worker.fetch(get("/v1/lists"), e)).status).toBe(401);
    expect(
      (await worker.fetch(get("/v1/lists", { authorization: "Bearer nope.nope" }), e)).status,
    ).toBe(401);
  });

  it("enforces the per-owner daily quota", async () => {
    const e = testEnv({ DEV_ALLOW_ALL: "true", MAX_QUERIES_PER_DAY: "2" });
    const auth = { authorization: "Bearer bot-1" };
    expect((await worker.fetch(get("/v1/lists", auth), e)).status).toBe(200);
    expect((await worker.fetch(get("/v1/lists", auth), e)).status).toBe(200);
    expect((await worker.fetch(get("/v1/lists", auth), e)).status).toBe(429);
  });
});

describe("/admin + projection failures", () => {
  it("surfaces a recorded projection error in the queue and detail", async () => {
    const e = adminEnv();
    const res = await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT)));
    const { submissionId } = (await res.json()) as { submissionId: string };
    await setProjectionError(e, submissionId, new Error("parser exploded"));

    const auth = { authorization: "Bearer admin" };
    const queue = (await (await worker.fetch(get("/admin/queue", auth), e)).json()) as {
      data: { submissionId: string; projectionError: string | null }[];
    };
    expect(queue.data).toHaveLength(1);
    expect(queue.data[0].projectionError).toContain("parser exploded");

    const detail = (await (
      await worker.fetch(get(`/admin/submissions/${submissionId}`, auth), e)
    ).json()) as { submission: { projectionError: string | null } };
    expect(detail.submission.projectionError).toContain("parser exploded");
  });

  it("clears the projection error after a successful reprocess", async () => {
    const e = adminEnv({ ALLOW_REPROCESS: "true" });
    const res = await ingest(e, envelope("sub-1", armyListCapture(SAMPLE_LIST_TEXT)));
    const { submissionId } = (await res.json()) as { submissionId: string };
    await setProjectionError(e, submissionId, new Error("transient"));

    const rerun = await worker.fetch(post("/reprocess", { submissionId }), e);
    expect(rerun.status).toBe(200);

    const sub = await env.DB.prepare("SELECT projection_error FROM submissions WHERE id = ?")
      .bind(submissionId)
      .first<{ projection_error: string | null }>();
    expect(sub!.projection_error).toBeNull();
  });

  it("refuses admin routes to non-admin owners", async () => {
    const e = adminEnv();
    const res = await worker.fetch(get("/admin/queue", { authorization: "Bearer not-admin" }), e);
    expect(res.status).toBe(403);
  });
});
