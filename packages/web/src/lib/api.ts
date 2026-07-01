// Client for the worker's anonymous public read tier (`/public/*`). All data is
// accepted-only and consent-gated server-side; this layer just shapes requests.

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export interface Placement {
  placing: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}

export interface EventSummary {
  eventId: string;
  name: string | null;
  date: string | null;
  format: string | null;
  region: string | null;
  listCount: number;
}

export interface EventListEntry {
  id: string;
  factionId: string | null;
  playerName: string | null;
  points: number | null;
  /** Importer warning count; null when unknown (row predates diagnostics). */
  warningCount: number | null;
  placement: Placement;
}

/** One importer diagnostic attached to a list (points-mismatch, unresolved names, ...). */
export interface ListWarning {
  code: string;
  message: string;
  raw_name: string | null;
}

export interface ListSummary {
  id: string;
  eventId: string | null;
  playerName: string | null;
  factionId: string | null;
  detachmentIds: string[];
  battleSize: string | null;
  /** Headline total: as-pasted when the source reported one, else computed. */
  points: number | null;
  /** Total exactly as pasted by the player; never reconciled with computed. */
  pointsReported: number | null;
  /** Total the importer summed from cost lines; never reconciled with reported. */
  pointsComputed: number | null;
  /** Points limit from the battle-size label (e.g. 2000), if any. */
  declaredLimit: number | null;
  /** Importer warning count; null when unknown (row predates diagnostics). */
  warningCount: number | null;
  shareToken: string | null;
  importFormat: string | null;
  placement: Placement;
}

export interface ListUnit {
  unitId: string | null;
  rawName: string;
  modelCount: number;
  isWarlord: boolean;
  enhancementId: string | null;
  resolved: boolean;
}

export type ListDetail = ListSummary & {
  units: ListUnit[];
  /** Full importer diagnostics; null when unknown (row predates diagnostics). */
  warnings: ListWarning[] | null;
};

export interface UnitStat {
  unitId: string;
  count: number;
  share: number;
}
export interface FactionStat {
  factionId: string;
  count: number;
  share: number;
}
export interface BifEntry {
  factionId: string;
  listId: string;
  eventId: string | null;
  playerName: string | null;
  placing: number;
  points: number | null;
  importFormat: string | null;
}

interface Page<T> {
  ok: boolean;
  data: T[];
  nextKey: string | null;
}

async function get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${BASE}/public${path}${suffix}`);
  if (res.status === 429) throw new Error("Rate limit reached; try again later.");
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export const api = {
  events: (params?: Record<string, string | undefined>) =>
    get<Page<EventSummary>>("/events", params),
  event: (id: string) =>
    get<{ ok: boolean; event: EventSummary; lists: EventListEntry[] }>(`/events/${encodeURIComponent(id)}`),
  lists: (params?: Record<string, string | undefined>) =>
    get<Page<ListSummary>>("/lists", params),
  list: (id: string) => get<{ ok: boolean; list: ListDetail }>(`/lists/${encodeURIComponent(id)}`),
  statsUnits: (params?: Record<string, string | undefined>) =>
    get<{ ok: boolean; totalLists: number; data: UnitStat[] }>("/stats/units", params),
  statsFactions: (params?: Record<string, string | undefined>) =>
    get<{ ok: boolean; totalLists: number; data: FactionStat[] }>("/stats/factions", params),
  statsBif: (params?: Record<string, string | undefined>) =>
    get<{ ok: boolean; data: BifEntry[] }>("/stats/bif", params),
};

/** Pretty-print a 40kdc entity id ("war-dog-karnivore" -> "War Dog Karnivore"). */
export function titleize(id: string | null): string {
  if (!id) return "–";
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
