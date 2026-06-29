/** Minimal async key/value store the submitter-id helpers depend on. */
export interface IdStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

/** Mint a fresh anonymous submitter id. Identifies the install, not the person. */
export function mintSubmitterId(): string {
  return crypto.randomUUID();
}

/**
 * Return the persisted submitter id, minting + persisting one on first use.
 * The store is injected so this is testable without the WXT `storage` runtime;
 * the background passes a thin adapter over a WXT storage item.
 */
export async function getOrCreateSubmitterId(store: IdStore): Promise<string> {
  const existing = await store.get();
  if (existing) return existing;
  const minted = mintSubmitterId();
  await store.set(minted);
  return minted;
}
