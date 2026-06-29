import {
  CAPTURE_MSG,
  type PageCaptureMessage,
  type RuntimeMessage,
  type ToastMessage,
} from "../lib/types";

/**
 * ISOLATED-world bridge. Relays page captures from the MAIN-world interceptor to
 * the background (the consent gate) and renders the upload toast the background
 * asks for. Like the interceptor, this never sends data off-device itself.
 */
export default defineContentScript({
  matches: ["*://*.bestcoastpairings.com/*"],
  runAt: "document_start",
  main() {
    // Relay: page (MAIN) -> background. The background decides whether consent
    // permits buffering/sending; this only moves data within the browser.
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as PageCaptureMessage | undefined;
      if (!data || data.source !== CAPTURE_MSG) return;
      const message: RuntimeMessage = { type: "capture", capture: data.capture };
      void browser.runtime.sendMessage(message).catch(() => {});
    });

    // The background fires a toast after a successful, consented upload.
    browser.runtime.onMessage.addListener((message: unknown) => {
      const toast = message as ToastMessage | undefined;
      if (toast && toast.type === "toast" && typeof toast.text === "string") {
        showToast(toast.text);
      }
    });
  },
});

/** Render a transient, shadow-DOM-isolated toast in the bottom-right corner. */
function showToast(text: string): void {
  const host = document.createElement("div");
  host.dataset.app = "40kdc-meta-toast";
  host.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });

  const box = document.createElement("div");
  box.textContent = text;
  box.style.cssText = [
    "font:500 13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "max-width:320px",
    "padding:10px 14px",
    "border-radius:8px",
    "background:#111827",
    "color:#f9fafb",
    "box-shadow:0 4px 16px rgba(0,0,0,.35)",
    "opacity:0",
    "transform:translateY(8px)",
    "transition:opacity .2s ease,transform .2s ease",
  ].join(";");
  shadow.appendChild(box);
  (document.body ?? document.documentElement).appendChild(host);

  // Animate in, then auto-dismiss after ~4s.
  requestAnimationFrame(() => {
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    box.style.opacity = "0";
    box.style.transform = "translateY(8px)";
    setTimeout(() => host.remove(), 250);
  }, 4000);
}
