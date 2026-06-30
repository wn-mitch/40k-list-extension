# 40kdc-meta Query API (`/v1`)

A read-only, key-authed API over the **accepted** competitive list/event data —
built so external tools and bots can query the dataset (and ease the transition
off BCP). All responses are JSON.

> Captured lists are **accepted (public) by default**; moderation is reactive (a
> quarantined or rejected submission is hidden). Only **accepted** lists are
> exposed here, names are **pseudonymized** (`player_<8 hex>`) unless that player
> has explicitly opted in to being named, and the raw player-id hash is never
> returned.

## Authentication

The API verifies short-lived **entitlement tokens** minted by the alpacasoft
keys service — this worker holds no secret, only the pinned public key.

1. **Get an access key.** Keys are operator-issued (no self-serve signup yet).
2. **Redeem it for a token:**
   ```bash
   curl -s https://keys.alpacasoft.dev/auth/key \
     -H 'content-type: application/json' \
     -d '{"key":"<your-access-key>"}'
   # -> { "entitlement": "<base64url(json)>.<base64url(sig)>" }
   ```
   The token is an Ed25519 envelope with claims `{ v:2, sub:"key:<label>", exp }`
   and is valid for **7 days**. Re-redeem when it expires.
3. **Call the API** with the token as a bearer:
   ```bash
   curl -s -H "Authorization: Bearer <token>" https://<ingest-host>/v1/me
   ```

The API never accepts a raw access key — only `keys.alpacasoft.dev` ever sees one.

### Status codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `401` | Missing, malformed, or expired token |
| `429` | Per-owner daily quota exceeded |
| `501` | Server has no signer pinned (query API not configured) |

## Rate limiting

Each owner (token `sub`) may make up to `MAX_QUERIES_PER_DAY` requests per UTC
day (default **5000**). Over the limit returns `429`.

## Pagination

List endpoints are cursor-paginated:

- `limit` — page size (default `50`, max `200`).
- `cursor` — pass the previous response's `nextKey` to get the next page.
- `nextKey` is `null` on the last page.

## Endpoints

### `GET /v1/me`
Returns the authenticated owner — useful to validate a token.
```json
{ "ok": true, "owner": "key:my-bot" }
```

### `GET /v1/events`
Events with at least one accepted list.
Query: `format`, `region`, `since` (ISO date, on event date), `limit`, `cursor`.
```json
{ "ok": true, "data": [
  { "eventId": "EVT123", "name": "An Open", "date": "2026-06-26T12:00:00.000Z",
    "format": "gt", "region": "us", "listCount": 42 }
], "nextKey": null }
```

### `GET /v1/events/:bcpEventId`
One event plus its accepted-list summaries (ordered by placing).
```json
{ "ok": true, "event": { "eventId": "EVT123", "name": "An Open", "date": "…",
  "format": "gt", "region": "us" },
  "lists": [ { "id": "…", "factionId": "chaos-knights", "playerName": "player_ab12cd34",
    "points": 2000, "placement": { "placing": 1, "wins": 5, "losses": 0, "draws": 0 } } ] }
```

### `GET /v1/lists`
Accepted lists matching filters.
Query: `eventId` (BCP event id), `factionId`, `detachmentId`, `unitId`,
`format`, `limit`, `cursor`.
```json
{ "ok": true, "data": [
  { "id": "…", "eventId": "EVT123", "playerName": "Hero Mcwin",
    "factionId": "chaos-knights", "detachmentIds": ["houndpack-lance"],
    "battleSize": "Strike Force", "points": 2000, "shareToken": null,
    "importFormat": "newrecruit-simple",
    "placement": { "placing": 1, "wins": 5, "losses": 0, "draws": 0 } }
], "nextKey": null }
```

### `GET /v1/lists/:id`
One accepted list, including its units (each with a 40kdc `unitId`, the
preserved `rawName`, and resolution status).
```json
{ "ok": true, "list": { "id": "…", "factionId": "chaos-knights",
  "placement": { "placing": 1, … },
  "units": [ { "unitId": "war-dog-karnivore", "rawName": "War Dog Karnivore",
    "modelCount": 1, "isWarlord": false, "enhancementId": null, "resolved": true } ] } }
```

### `GET /v1/stats/units`
Most-played units across accepted lists in scope.
Query: `format`, `factionId`, `since`, `limit`.
`count` = number of accepted lists containing the unit; `share` = `count / totalLists`.
```json
{ "ok": true, "totalLists": 120, "data": [
  { "unitId": "war-dog-karnivore", "count": 88, "share": 0.733 }
] }
```

### `GET /v1/stats/factions`
Faction representation across accepted lists in scope.
Query: `format`, `factionId`, `since`.
```json
{ "ok": true, "totalLists": 120, "data": [
  { "factionId": "chaos-knights", "count": 30, "share": 0.25 }
] }
```

### `GET /v1/stats/bif`
Best-in-faction: the top-placing accepted list per faction in the window.
Query: `format`, `factionId`, `since`.
```json
{ "ok": true, "data": [
  { "factionId": "chaos-knights", "listId": "…", "eventId": "EVT123",
    "playerName": "Hero Mcwin", "placing": 1, "points": 2000,
    "importFormat": "newrecruit-simple" }
] }
```

## Notes for bot builders

- Cache the entitlement token and refresh on expiry (≈7 days) or on a `401`.
- Respect `429` with a back-off until the next UTC day.
- `factionId`, `unitId`, and `detachmentId` are
  [`@alpaca-software/40kdc-data`](https://www.npmjs.com/package/@alpaca-software/40kdc-data)
  entity IDs — the same IDs the normalizer resolves to.
