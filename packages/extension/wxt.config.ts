import { defineConfig } from "wxt";

// Chromium MV3 only (Chrome/Edge/Brave). `world: "MAIN"` content scripts are
// Chromium-only, which is fine for v1 — Firefox is a later phase.
export default defineConfig({
  manifest: {
    name: "40kdc-meta capture",
    description:
      "Consent-based capture of BCP army lists you already receive.",
    // `storage` is the only privileged API the extension needs. Capturing
    // response bodies is done via MAIN-world fetch/XHR overrides, not webRequest.
    permissions: ["storage"],
    // Broad BCP match for v1; the exact API host is pinned + narrowed in 1b.
    // `localhost` lets the background POST to the local dev worker — replaced
    // with the deployed ingest origin before any store submission (Phase 2).
    host_permissions: [
      "*://*.bestcoastpairings.com/*",
      "http://localhost/*",
    ],
  },
});
