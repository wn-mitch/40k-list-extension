# 40kdc-meta

A **consent-based, open-source** repository of competitive Warhammer 40,000 army
lists. A browser extension passively captures the Best Coast Pairings (BCP) data
a user already receives while browsing — with their consent and in plain sight —
and a Cloudflare backend normalizes each list into [`@alpaca-software/40kdc-data`](https://www.npmjs.com/package/@alpaca-software/40kdc-data)
entity IDs and stores it in a public, queryable form: find a list, "best in
faction" this week, most-played units, faction representation, and so on.

> **Status: full capture → publish pipeline working, with a browse UI, reactive
> moderation, and consent ops.** The consent-based MV3 extension (Phase 1)
> captures BCP army lists; the Worker stores raw in R2, normalizes each list into
> the D1 projection (Phase 3), and publishes it anonymized on capture. Both the
> key-authed `/v1` API (Phase 5) and an anonymous `/public` tier behind a Svelte
> browse UI (Phase 6) serve the public, consent-gated data; an admin moderation
> UI (Phase 8) reactively quarantines/rejects abuse and runs consent ops
> (Phase 7). Remaining: the pre-launch checklist ([`LAUNCH.md`](./LAUNCH.md):
> production config + legal/privacy sign-off).

## Why this is trustworthy

The extension reads an authenticated BCP session, which makes trust the whole
product. So:

- **Open source, public from the first commit** — including the backend Worker.
- **Reproducible, source-pinned builds** — the store build is diffable against a
  tagged commit.
- **Minimal permissions** — BCP domains only; captures just the API responses it
  needs, never other sites or page content at large.
- **Never silent** — every upload surfaces a toast ("Lists uploaded to
  lists.alpacasoft.dev") and a popup activity log. You always see when data
  leaves your browser.
- **Consent-first** — players opt in to be named; default is pseudonymized; opt-out
  is honored retroactively.

Anti-abuse is built in: every submission is attributed to an anonymous,
per-install id and is rate-limited per submitter per day (anti-flood). Lists are
published anonymized on capture — moderation is **reactive**: an abusive or
invalid submission is quarantined or rejected after the fact (removing it from
the public data), and bad sources can be blocked. The per-submitter cap and the
submitter blocklist are the pre-publish defenses.

## Layout

```
packages/
  shared/      TS types: BCP capture shapes, D1 rows, consent + submission model
  normalizer/  BCP list text -> resolved 40kdc Roster -> flat rows (uses the package)
  worker/      Cloudflare Worker: ingestion + projection + query API + admin + public read tier
  extension/   MV3 browser extension: consent-based BCP capture -> /ingest
  web/         Svelte SPA browse UI over the /public read tier -> lists.alpacasoft.dev
  admin/       moderation UI                                  (later; backend lives in worker)
migrations/    D1 schema migrations
```

Raw captures in R2 are the **source of truth**; D1 rows are a rebuildable
projection stamped with `parser_version`, so improving the parser is a
reprocessing job, not a migration.

## Develop

```bash
npm install                 # resolves the workspace + the published data package
npm test                    # vitest — incl. the normalizer integration smoke test
npm run typecheck           # tsc across all packages
npm run migrate:local       # apply D1 migrations to a local SQLite
npm run dev:worker          # boot the ingestion Worker locally (R2 + D1 bindings)
```

Before deploying for real: `wrangler d1 create 40kdc_meta_db` and
`wrangler r2 bucket create 40kdc-meta-raw`, then paste the D1 `database_id` into
`packages/worker/wrangler.jsonc`.

## How the capture extension works

`packages/extension/` is a Manifest-V3 (Chromium) extension built with
[WXT](https://wxt.dev). It observes the BCP API responses you **already** receive
while browsing — never other sites or page content at large — and forwards them
only with your explicit consent:

1. A **MAIN-world** content script patches `fetch`/`XMLHttpRequest` at
   `document_start` to observe BCP JSON responses, then `postMessage`s them
   in-page. It never sends anything off-device.
2. An **ISOLATED** bridge relays those captures to the background service worker
   and renders the upload toast.
3. The **background service worker is the single consent gate** — the only code
   that ever makes an off-device request. With consent **OFF (the default)**,
   captures are dropped, never buffered. With consent ON, it batches captures
   and POSTs them to the ingestion Worker's `/ingest`.
4. Every successful upload shows a **toast** and appends to the popup's
   **activity log**, so you always see when data leaves your browser.

v1 forwards responses **raw** (verbatim); typed list extraction waits until
BCP's response shapes are pinned against a live session (Phase 1b).

```bash
npm run build:ext   # -> packages/extension/.output/chrome-mv3 (load unpacked)
npm run zip:ext     # -> packages/extension/.output/*-chrome.zip (store build)
```

Store builds are produced by a public CI workflow that emits signed
[SLSA build provenance](https://slsa.dev). Verify a downloaded zip against the
workflow + commit that produced it:

```bash
gh attestation verify <downloaded-zip> --repo wn-mitch/40k-list-extension
```

See [`METHODOLOGY.md`](./METHODOLOGY.md) for exactly what is captured and how to
opt out.

## Roadmap

0. **Scaffold** ✓ — repo, schema, data-package integration.
1. **Capture spike** ✓ — MV3 extension (consent gate + upload toast + activity
   log) capturing `newprod-api.bestcoastpairings.com/v1/*` into `/ingest`.
2. **Ingestion** ✓ — anonymous attributed submissions, raw + extracted text in
   R2, submitter blocklist, and a per-submitter daily ingest rate limit
   (anti-flood). Lists are published anonymized on capture.
3. **Normalization + reconciliation** ✓ — captured army lists are normalized
   (`tryImportRoster`) and projected into D1 at ingest; lists dedup by
   content_hash with a corroboration trail, and `/reprocess` re-derives rows
   from raw when the parser improves.
4. **Moderation backend** ✓ — authed endpoints (`/admin/queue`, set a
   submission's status, block a submitter, submission detail). Moderation is
   reactive: quarantine/reject hides a submission from the public tiers. The
   visual panel ships in Phase 8.
5. **Query API + stats** ✓ — key-authed `/v1` read API (entitlement tokens from
   keys.alpacasoft.dev) over accepted, consent-gated data: events, lists,
   best-in-faction, most-played units, faction rep; per-owner daily quota. See
   [`API.md`](./API.md).
6. **Browse UI** ✓ *(browse)* — Svelte SPA (`packages/web/`) over a new anonymous,
   IP-rate-limited `/public` read tier: events, event detail, list browser with
   filters, list detail (units), and faction/unit/best-in-faction stats.
7. **Consent ops + launch gate** ✓ *(consent ops + docs)* — admin-settable
   player consent (`POST /admin/players/consent`: be-named / be-excluded, with
   exclusion as identity-suppression and durable across reprocessing), a static
   `/methodology` page in the browse UI, the player-consent section in
   [`METHODOLOGY.md`](./METHODOLOGY.md), and a [`LAUNCH.md`](./LAUNCH.md)
   pre-launch checklist. Deployment and legal/privacy review are the remaining
   (non-code) launch gates.
8. **Default-accept + admin moderation UI** ✓ — captured lists are published
   anonymized on ingest (no pre-publication review); moderation is reactive. A
   Svelte admin panel in `packages/web/` — gated by a keys.alpacasoft.dev
   entitlement token whose owner is in `ADMIN_OWNERS` — reviews the firehose,
   inspects any submission (including the quarantined/rejected ones the public
   API hides), quarantines/rejects or re-accepts, blocks submitters, and runs
   consent ops.

## License

MIT (`tools`-style, matching the 40kdc ecosystem). Enrichment/derived data
licensing follows upstream `@alpaca-software/40kdc-data` terms.
