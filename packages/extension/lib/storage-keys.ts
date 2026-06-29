/**
 * Storage keys shared between the background (consent gate) and the popup.
 * Kept here, framework-free, so both contexts define `storage` items over the
 * exact same underlying keys without importing the WXT runtime into `lib/`.
 */
export const STORAGE_KEYS = {
  consent: "local:consent",
  activityLog: "local:activityLog",
  submitterId: "local:submitterId",
} as const;
