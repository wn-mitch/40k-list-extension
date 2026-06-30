# Methodology: what the capture extension does, and what it doesn't

This project is built on a simple promise: **trust is the product.** The capture
extension reads an authenticated Best Coast Pairings (BCP) session, so every
design choice below exists to make "what leaves your browser, and when" obvious
and under your control.

## What is captured

- **Only BCP API responses you already receive.** While you browse BCP, the
  extension observes the JSON the BCP site itself requests (event, list, and
  pairing data) by wrapping `fetch`/`XMLHttpRequest` in the page. It reads the
  same bytes BCP already sent to your browser.
- **BCP domains only.** The extension is scoped to `*.bestcoastpairings.com`. It
  does not run on, observe, or capture any other website, and it does not read
  page content at large — only network responses, and only JSON ones.
- **Not auth or static noise.** Auth endpoints and static assets
  (`.js`, `.css`, images, fonts) are filtered out before anything is buffered.

## Nothing leaves your browser until you opt in

- **Consent is OFF by default.** Captured responses are dropped — never buffered,
  never queued — until you flip the consent toggle ON in the extension popup.
- **One choke point.** Only the background service worker ever makes an
  off-device request, and only when consent is ON. The in-page scripts can only
  move data *within* your browser; they cannot send anything anywhere.
- **You can stop at any time.** Toggle consent OFF and buffering/sending stops
  immediately. "Clear log" empties the pending buffer and the activity log.

## You always see when data leaves

- **A toast** appears on the BCP page after every successful upload, naming the
  destination host.
- **An activity log** in the popup records each upload (how many captures, the
  response status, whether it was a duplicate) so there is a visible, local
  history of everything that was sent.

## What identifies a submission

- **An anonymous, per-install `submitterId`** (a random UUID) is attached to each
  submission. It identifies the *source install*, not you. It contains no
  account, name, email, or device information.
- Submissions are **published anonymized on capture** — there is no
  pre-publication human review. Moderation is **reactive**: an abusive or
  invalid submission is quarantined or rejected after the fact, which removes it
  from the public data. Player display names are pseudonymized by default; being
  named is a separate, explicit opt-in, and exclusion is an opt-out — both are
  described below.

## For players whose lists are captured

- **Lists are published anonymized.** A player is rendered as a
  `player_<8 hex>` pseudonym derived from their BCP id, never a real name.
  Captured lists are public by default; quarantined or rejected lists are never
  public.
- **Being named is an explicit opt-in.** If you want your list credited under
  your name, a maintainer records your chosen display name and it replaces the
  pseudonym.
- **Exclusion is an opt-out (identity-suppression).** If you ask to be excluded,
  your name is purged and the pseudonym is forced. The anonymized list itself
  remains as part of the aggregate meta data (it still counts in statistics) but
  can no longer be tied to you.
- **How to request either.** Open an issue on the
  [repository issue tracker](https://github.com/wn-mitch/40k-list-extension/issues). A
  maintainer applies the change; it is durable and survives later captures and
  reprocessing. (Consent is not self-serve: player ids are public, so naming and
  exclusion are operator-mediated to prevent impersonation.)

## How to opt out

- **Turn it off:** flip the consent toggle OFF in the popup. Nothing more is sent.
- **Clear local state:** use "Clear log" in the popup to empty the buffer and log.
- **Remove it entirely:** uninstall the extension from your browser's extensions
  page. All local state (consent flag, `submitterId`, activity log) is removed
  with it.

## Verifiable builds

The store build is produced by a **public** GitHub Actions workflow from a tagged
commit, and the resulting zip carries signed
[SLSA build provenance](https://slsa.dev). You can confirm a downloaded build was
produced by that workflow from this source:

```bash
gh attestation verify <downloaded-zip> --repo wn-mitch/40k-list-extension
```

The full extension source — and the backend Worker it talks to — is public in
this repository.
