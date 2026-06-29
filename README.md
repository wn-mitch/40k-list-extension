# 40kdc-meta

A **consent-based, open-source** repository of competitive Warhammer 40,000 army
lists. A browser extension passively captures the Best Coast Pairings (BCP) data
a user already receives while browsing — with their consent and in plain sight —
and a Cloudflare backend normalizes each list into [`@alpaca-software/40kdc-data`](https://www.npmjs.com/package/@alpaca-software/40kdc-data)
entity IDs and stores it in a public, queryable form: find a list, "best in
faction" this week, most-played units, faction representation, and so on.

> **Status: Phase 0 (scaffold).** Nothing talks to BCP yet. This repo currently
> stands up the workspace, the storage schema, and the data-package integration.
> See the delivery roadmap below.

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
per-install id, lands in a `pending` state, and is only made public after
*curing* (validity + parse + corroboration). Bad sources can be blocked.

## Layout

```
packages/
  shared/      TS types: BCP capture shapes, D1 rows, consent + submission model
  normalizer/  BCP list text -> resolved 40kdc Roster -> flat rows (uses the package)
  worker/      Cloudflare Worker: ingestion (+ query API later)
  web/         browse UI -> lists.alpacasoft.dev          (later phase)
  admin/       moderation queue + reconciliation           (later phase)
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

## Roadmap

0. **Scaffold** (this) — repo, schema, data-package integration.
1. **Capture spike** — MV3 extension, discover/pin BCP response shapes, upload toast.
2. **Ingestion + curing** — Worker auth/blocklist, raw -> R2, `pending` submissions.
3. **Normalization + reconciliation** — `tryImportRoster` -> D1, dedup, reprocessing.
4. **Admin panel** — moderation queue, blocking, list reconciliation.
5. **Query API + stats** — BIF, most-played units, faction rep (accepted lists only).
6. **Browse UI** — `lists.alpacasoft.dev`.
7. **Consent ops + launch gate** — opt-in/out flows, methodology page, legal review.

## License

MIT (`tools`-style, matching the 40kdc ecosystem). Enrichment/derived data
licensing follows upstream `@alpaca-software/40kdc-data` terms.
