import type { CapturedResponse } from "@40kdc-meta/shared";

/** postMessage discriminator: MAIN-world interceptor -> ISOLATED bridge. */
export const CAPTURE_MSG = "40kdc-meta/capture" as const;

/** Payload posted from the page (MAIN world) to the bridge (ISOLATED world). */
export interface PageCaptureMessage {
  source: typeof CAPTURE_MSG;
  capture: CapturedResponse;
}

/** One entry in the popup's activity log (rendered newest-first). */
export interface ActivityEntry {
  /** ms epoch */
  at: number;
  /** number of captures in the flushed batch */
  count: number;
  /** HTTP status of the /ingest response, or 0 on network failure */
  status: number;
  /** worker reported this batch as a duplicate */
  duplicate?: boolean;
  /** R2 key the worker stored the raw payload under */
  rawKey?: string;
  /** present when the flush failed */
  error?: string;
}

/** Messages the background service worker accepts via runtime.sendMessage. */
export type RuntimeMessage =
  | { type: "capture"; capture: CapturedResponse }
  | { type: "sendNow" }
  | { type: "clear" };

/** Message the background sends to the bridge content script to show a toast. */
export interface ToastMessage {
  type: "toast";
  text: string;
}
