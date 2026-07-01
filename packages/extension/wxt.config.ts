import { defineConfig } from "wxt";

// Chromium MV3 only (Chrome/Edge/Brave). `world: "MAIN"` content scripts are
// Chromium-only, which is fine for v1; Firefox is a later phase.
export default defineConfig({
  // Manifest depends on build mode: the store build (`wxt build|zip`, production)
  // drops the localhost host permission and adds the deployed ingest origin; dev
  // keeps localhost so the background can POST to a local worker.
  manifest: ({ mode }) => ({
    name: "40kdc-meta capture",
    description: "Consent-based capture of BCP army lists you already receive.",
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
    // `storage` is the only privileged API the extension needs. Capturing
    // response bodies is done via MAIN-world fetch/XHR overrides, not webRequest.
    permissions: ["storage"],
    host_permissions: [
      "*://*.bestcoastpairings.com/*",
      ...(mode === "production" ? ["https://lists.alpacasoft.dev/*"] : ["http://localhost/*"]),
    ],
  }),
});
