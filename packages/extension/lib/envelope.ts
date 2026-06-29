import type { CapturedResponse, SubmissionEnvelope } from "@40kdc-meta/shared";

/**
 * Build the ingestion envelope from a batch of captured responses.
 *
 * v1 is raw-passthrough: `lists: []` (typed extraction is impossible until BCP
 * shapes are pinned in 1b), and the captures are placed in both `captures`
 * (typed consumers) and `raw` (the worker stores `raw` verbatim in R2 as the
 * reprocessing source of truth). Pure.
 */
export function buildEnvelope(
  submitterId: string,
  captures: CapturedResponse[],
  now: number = Date.now(),
): SubmissionEnvelope {
  return {
    submitterId,
    capturedAt: now,
    lists: [],
    captures,
    raw: { captures },
  };
}
