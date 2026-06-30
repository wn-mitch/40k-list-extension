// Authed admin client + sign-in state for the moderation UI.
//
// Auth = an alpacasoft-keys entitlement token. The operator either pastes a
// pre-redeemed token (`<b64url>.<b64url>`) or an access key, which the SPA
// redeems in-browser at keys.alpacasoft.dev/auth/key (CORS is open). The token —
// never the access key — is held in sessionStorage and sent as the bearer on
// /admin calls. The only real gate is server-side `requireAdmin` (token owner ∈
// ADMIN_OWNERS); hiding the nav is just UX.
import { adminErrorMessage, looksLikeToken } from "./admin-auth";
import type { Placement, ListUnit } from "./api";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const KEYS_BASE = (import.meta.env.VITE_KEYS_BASE as string | undefined) ?? "https://keys.alpacasoft.dev";
const TOKEN_KEY = "adminToken";

/** Token (the bearer) + the owner sub resolved from `/v1/me`. The token persists
 *  in sessionStorage so a reload keeps the session; the owner is re-resolved. */
export const adminAuth = $state<{ token: string; owner: string }>({
  token: sessionStorage.getItem(TOKEN_KEY) ?? "",
  owner: "",
});

export interface QueueEntry {
  submissionId: string;
  submitterId: string;
  receivedAt: number;
  status: string;
  listCount: number;
}

export interface QueuePage {
  ok: boolean;
  data: QueueEntry[];
  nextKey: string | null;
}

export interface SubmissionMeta {
  submissionId: string;
  submitterId: string;
  rawKey: string;
  payloadHash: string;
  receivedAt: number;
  status: string;
}

export interface AdminList {
  id: string;
  eventId: string | null;
  playerName: string | null;
  consent: string | null;
  factionId: string | null;
  detachmentIds: string[];
  battleSize: string | null;
  points: number | null;
  shareToken: string | null;
  importFormat: string | null;
  placement: Placement;
  units: ListUnit[];
}

export interface SubmissionDetail {
  ok: boolean;
  submission: SubmissionMeta;
  lists: AdminList[];
}

export interface ConsentBody {
  bcpPlayerId: string;
  consent: string;
  displayName: string | null;
}

/** Read a JSON `{ error }` field off a failed Response (narrowed, never trusted
 *  blindly), then map the status to an operator-facing message. */
async function failure(res: Response): Promise<Error> {
  let serverError: string | undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      serverError = body.error;
    }
  } catch {
    // non-JSON error body — fall back to the status-only message
  }
  return new Error(adminErrorMessage(res.status, serverError));
}

/** One authed `/admin/*` call. On 401 it clears the session (the bearer is dead)
 *  so the UI drops back to the sign-in bar. */
async function authed<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${adminAuth.token}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}/admin${path}`, init);
  if (res.ok) return (await res.json()) as T;
  if (res.status === 401) signOut();
  throw await failure(res);
}

/** Redeem a raw access key for an entitlement token at the keys service. The raw
 *  key never touches our worker or storage — only the resulting token does. */
async function redeemKey(key: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${KEYS_BASE}/auth/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch {
    throw new Error(
      "Couldn't reach the keys service from the browser. Redeem the key elsewhere and paste the token instead.",
    );
  }
  if (!res.ok) {
    if (res.status === 403) throw new Error("That access key was rejected (bad_key).");
    if (res.status === 501) throw new Error("The keys service has no signer configured.");
    throw new Error(`Key redemption failed (HTTP ${res.status}).`);
  }
  const body: unknown = await res.json();
  if (body && typeof body === "object") {
    if ("entitlement" in body && typeof body.entitlement === "string") return body.entitlement;
    if ("token" in body && typeof body.token === "string") return body.token;
  }
  throw new Error("Keys service returned no entitlement token.");
}

/** Sign in with either a pre-redeemed token or an access key, then validate it
 *  against `/v1/me` (which also resolves the owner sub). Throws on any failure;
 *  the token/owner are only persisted once `/v1/me` confirms the token. */
export async function signIn(secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error("Enter an access key or a token.");

  const token = looksLikeToken(trimmed) ? trimmed : await redeemKey(trimmed);

  const res = await fetch(`${API_BASE}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw await failure(res);

  let owner = "";
  const body: unknown = await res.json();
  if (body && typeof body === "object" && "owner" in body && typeof body.owner === "string") {
    owner = body.owner;
  }
  adminAuth.token = token;
  adminAuth.owner = owner;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function signOut(): void {
  adminAuth.token = "";
  adminAuth.owner = "";
  sessionStorage.removeItem(TOKEN_KEY);
}

export const adminApi = {
  queue(params: { status?: string; cursor?: string; limit?: string }): Promise<QueuePage> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const suffix = qs.toString() ? `?${qs}` : "";
    return authed<QueuePage>(`/queue${suffix}`);
  },
  submission(id: string): Promise<SubmissionDetail> {
    return authed<SubmissionDetail>(`/submissions/${encodeURIComponent(id)}`);
  },
  setStatus(id: string, status: string): Promise<{ ok: boolean; submissionId: string; status: string }> {
    return authed(`/submissions/${encodeURIComponent(id)}/status`, "POST", { status });
  },
  block(
    submitterId: string,
    blocked: boolean,
    reason?: string,
  ): Promise<{ ok: boolean; submitterId: string; blocked: boolean }> {
    return authed(`/submitters/${encodeURIComponent(submitterId)}/block`, "POST", { blocked, reason });
  },
  setConsent(body: ConsentBody): Promise<{ ok: boolean; consent: string; named: boolean }> {
    return authed(`/players/consent`, "POST", body);
  },
};
