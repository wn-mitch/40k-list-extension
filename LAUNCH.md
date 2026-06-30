# Launch checklist

A pre-launch gate for going from local/dev to a public deployment. This is a
**manual checklist** — nothing here is enforced at runtime. Work through both
groups before the first store submission and the first production deploy of the
worker and web app.

Tick each box only after you have verified it yourself; "should be fine" is not
a tick.

## Code / config readiness

### Worker (`packages/worker/wrangler.jsonc`, deploy-time vars/secrets)

- [x] **`ENTITLEMENT_PUBLIC_KEYS`** set to the live signer key(s). The committed
      `hH3klVi_…` is the current `keys.alpacasoft.dev/auth/public-key` signer —
      verified end-to-end (it validates a freshly-minted token). Rotation is
      add-new / flip / remove (comma-separated).
- [x] **`ADMIN_OWNERS`** set to `key:List Admin Panel` (the minted key's owner
      sub). With it unset, `/admin/*` (queue, submission status, submitter block,
      **player consent**) refuses with `501`.
- [x] **`DEV_ALLOW_ALL` unset** (or not `"true"`). This bypass accepts *any*
      bearer as the owner and MUST NEVER be set in production.
- [x] **`ALLOW_REPROCESS` unset** (or not `"true"`). The guarded `/reprocess`
      endpoint must 404 in production.
- [ ] **Rate caps reviewed** for production load: `MAX_QUERIES_PER_DAY` (per
      owner), `MAX_INGESTS_PER_DAY` (per submitter), `MAX_PUBLIC_QUERIES_PER_DAY`
      (per client IP, anonymous read tier).
- [x] **D1 `database_id`** set to the production database
      `5e271f92-cd61-4cd7-ab9f-0b83878fe5e4` (from `wrangler d1 create 40kdc_meta_db`).
- [x] **Migrations applied to remote:** `npm run migrate:remote` against the
      production D1.

### Extension (`packages/extension`)

- [x] **`host_permissions` narrowed** in `wxt.config.ts`: keep
      `*://*.bestcoastpairings.com/*`, **remove `http://localhost/*`**, and add
      the deployed ingest origin so the background worker can POST to production.
- [x] **`WXT_INGEST_URL`** points at the production ingest endpoint, not
      `http://localhost:8787/ingest`.
- [ ] **Verifiable build:** tag a commit `ext-v*` to run the public
      `extension-release` workflow; confirm the release zip carries SLSA build
      provenance and that `gh attestation verify <zip> --repo wn-mitch/40k-list-extension`
      passes against the downloaded asset.

### Web (`packages/web`)

- [x] **`VITE_API_BASE`** points at the production worker origin, not
      `http://localhost:8799` (empty string is fine when the SPA is served from
      the worker's own domain).
- [x] **Methodology page reachable:** `#/methodology` renders the consent
      contract and the opt-in/opt-out contact path, and the opt-out link points
      at the real issue tracker / contact channel.

### Repo-wide

- [x] **`<owner>/40kdc-meta` placeholders replaced** with `wn-mitch/40k-list-extension` in
      `README.md`, `METHODOLOGY.md`, and the methodology web view (the published
      opt-in/opt-out contact path).
- [x] **`npm run typecheck` and `npm test` green** on the release commit.

## Non-code sign-offs (legal / privacy / store)

None of these are runtime-enforced; they are gates on a human, not the build.

- [ ] **Privacy / legal review** of the consent model and the methodology copy
      (extension `METHODOLOGY.md`, the web methodology view): captured data,
      off-by-default consent, anonymized publication, and the player
      opt-in (be-named) / opt-out (identity-suppression) contract.
- [ ] **Opt-in / opt-out contact channel monitored.** The issue tracker (or
      whichever channel the methodology page names) has an owner who will act on
      consent requests and apply them via `POST /admin/players/consent`.
- [ ] **Consent-ops runbook confirmed.** A maintainer can set a player's consent
      durably: `opted_in` + display name to credit by name, `excluded` to purge
      the name and force the pseudonym (the anonymized list stays in aggregate
      stats). State survives later captures and `/reprocess`.
- [ ] **Store-listing review.** Chrome Web Store listing copy, privacy
      disclosures, screenshots, and permission justifications match what the
      extension actually does.
