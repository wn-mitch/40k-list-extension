import type { CapturedResponse } from "@40kdc-meta/shared";
import { shouldCapture } from "../lib/capture-filter";
import { CAPTURE_MSG, type PageCaptureMessage } from "../lib/types";

/**
 * MAIN-world interceptor. Runs in the page's own JS context at document_start so
 * its `fetch`/`XMLHttpRequest` overrides are installed before BCP's scripts run.
 *
 * It only *observes* responses and re-posts them in-page via `window.postMessage`
 * to the ISOLATED bridge. It has no `browser.*`/`storage` access and NEVER makes
 * an off-device request; the background service worker is the sole consent gate.
 */
export default defineContentScript({
  matches: ["*://*.bestcoastpairings.com/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    // Captured bodies above this are dropped: list/event JSON is small; large
    // payloads are not what we want and would bloat the channel.
    const MAX_BODY_BYTES = 2 * 1024 * 1024;

    const post = (
      url: string,
      method: string,
      status: number,
      contentType: string | null,
      text: string,
    ): void => {
      let body: unknown = text;
      if (contentType && contentType.toLowerCase().includes("application/json")) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const capture: CapturedResponse = {
        url,
        method,
        status,
        body,
        capturedAt: Date.now(),
      };
      const message: PageCaptureMessage = { source: CAPTURE_MSG, capture };
      window.postMessage(message, "*");
    };

    // --- fetch -------------------------------------------------------------
    const origFetch = window.fetch;
    window.fetch = async function (
      this: unknown,
      ...args: Parameters<typeof fetch>
    ): Promise<Response> {
      const res = await origFetch.apply(this as typeof globalThis, args);
      try {
        const input = args[0];
        let rawUrl: string;
        if (typeof input === "string") rawUrl = input;
        else if (input instanceof URL) rawUrl = input.href;
        else rawUrl = input.url;
        const url = new URL(rawUrl, location.href).href;
        const method = (
          args[1]?.method ??
          (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        const contentType = res.headers.get("content-type");
        if (shouldCapture(url, contentType)) {
          // Clone synchronously before any page consumer reads the body, then
          // read the clone asynchronously; the real response is untouched.
          const clone = res.clone();
          void clone
            .text()
            .then((text) => {
              if (text.length <= MAX_BODY_BYTES) {
                post(url, method, res.status, contentType, text);
              }
            })
            .catch(() => {});
        }
      } catch {
        // Capture must never break the page's own fetch.
      }
      return res;
    };

    // --- XMLHttpRequest ----------------------------------------------------
    const origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(typeof url === "string" ? url : url.href, location.href).href;
      } catch {
        resolvedUrl = typeof url === "string" ? url : String(url);
      }
      const reqMethod = (method || "GET").toUpperCase();
      this.addEventListener("load", () => {
        try {
          const contentType = this.getResponseHeader("content-type");
          if (!shouldCapture(resolvedUrl, contentType)) return;
          let text: string;
          if (this.responseType === "" || this.responseType === "text") {
            text = this.responseText;
          } else if (this.responseType === "json") {
            text = JSON.stringify(this.response);
          } else {
            return;
          }
          if (text.length <= MAX_BODY_BYTES) {
            post(resolvedUrl, reqMethod, this.status, contentType, text);
          }
        } catch {
          // ignore
        }
      });
      return (origOpen as (...a: unknown[]) => void).apply(this, [method, url, ...rest]);
    };
  },
});
