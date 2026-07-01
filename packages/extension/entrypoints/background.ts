import type { CapturedResponse } from "@40kdc-meta/shared";
import { buildEnvelope } from "../lib/envelope";
import { getOrCreateSubmitterId } from "../lib/submitter-id";
import { STORAGE_KEYS } from "../lib/storage-keys";
import type { ActivityEntry, RuntimeMessage, ToastMessage } from "../lib/types";

/**
 * Background service worker: the SINGLE consent gate.
 *
 * The MAIN-world interceptor and the ISOLATED bridge only move data within the
 * page. Only this worker ever makes an off-device request, and only when the
 * user has toggled consent ON. One auditable choke point for "data leaves the
 * browser": the `fetch` in {@link flush}.
 */
export default defineBackground({
  main() {
    const consentItem = storage.defineItem<boolean>(STORAGE_KEYS.consent, {
      fallback: false,
    });
    const logItem = storage.defineItem<ActivityEntry[]>(STORAGE_KEYS.activityLog, {
      fallback: [],
    });
    const submitterIdItem = storage.defineItem<string | null>(
      STORAGE_KEYS.submitterId,
      { fallback: null },
    );

    // Resolve (mint on first use) the anonymous submitter id once at startup.
    const submitterIdPromise = getOrCreateSubmitterId({
      get: () => submitterIdItem.getValue(),
      set: (value) => submitterIdItem.setValue(value),
    });

    const INGEST_URL =
      import.meta.env.WXT_INGEST_URL ?? "http://localhost:8787/ingest";
    const DEBOUNCE_MS = 2000;
    const MAX_FAILURES = 3;
    const MAX_LOG = 50;

    let buffer: CapturedResponse[] = [];
    let flushTimer: number | undefined;
    let consecutiveFailures = 0;

    const appendLog = async (entry: ActivityEntry): Promise<void> => {
      const log = await logItem.getValue();
      await logItem.setValue([entry, ...log].slice(0, MAX_LOG));
    };

    const notifyActiveBcpTab = async (text: string): Promise<void> => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          url: "*://*.bestcoastpairings.com/*",
        });
        const message: ToastMessage = { type: "toast", text };
        await Promise.all(
          tabs.map((tab) =>
            tab.id == null
              ? undefined
              : browser.tabs.sendMessage(tab.id, message).catch(() => {}),
          ),
        );
      } catch {
        // A missing tab/listener must not fail the upload.
      }
    };

    const flush = async (): Promise<void> => {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (buffer.length === 0) return;
      const batch = buffer;

      try {
        const submitterId = await submitterIdPromise;
        const envelope = buildEnvelope(submitterId, batch);
        const res = await fetch(INGEST_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let duplicate = false;
        let rawKey: string | undefined;
        try {
          const json = (await res.json()) as { duplicate?: boolean; rawKey?: string };
          duplicate = Boolean(json.duplicate);
          rawKey = json.rawKey;
        } catch {
          // A non-JSON 2xx still counts as delivered.
        }

        buffer = [];
        consecutiveFailures = 0;
        await appendLog({
          at: Date.now(),
          count: batch.length,
          status: res.status,
          duplicate,
          rawKey,
        });
        const host = new URL(INGEST_URL).host;
        const text = duplicate
          ? `Capture already uploaded (${host})`
          : `Uploaded ${batch.length} capture${batch.length === 1 ? "" : "s"} to ${host}`;
        await notifyActiveBcpTab(text);
      } catch (err) {
        consecutiveFailures += 1;
        await appendLog({
          at: Date.now(),
          count: batch.length,
          status: 0,
          error: String(err),
        });
        // Keep the buffer for one retry on the next flush; give up after 3.
        if (consecutiveFailures >= MAX_FAILURES) {
          buffer = [];
          consecutiveFailures = 0;
        }
      }
    };

    browser.runtime.onMessage.addListener((raw: unknown) => {
      const message = raw as RuntimeMessage | undefined;
      if (!message || typeof message.type !== "string") return;
      void (async () => {
        if (message.type === "capture") {
          // The consent gate: with consent OFF, captures are dropped, never
          // buffered, so nothing can later leak off-device.
          if (!(await consentItem.getValue())) return;
          buffer.push(message.capture);
          clearTimeout(flushTimer);
          flushTimer = setTimeout(() => void flush(), DEBOUNCE_MS) as unknown as number;
        } else if (message.type === "sendNow") {
          await flush();
        } else if (message.type === "clear") {
          buffer = [];
          if (flushTimer !== undefined) {
            clearTimeout(flushTimer);
            flushTimer = undefined;
          }
          await logItem.setValue([]);
        }
      })();
    });
  },
});
