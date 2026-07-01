<script lang="ts">
  import { titleize } from "../../lib/api";
  import { adminApi, adminAuth, type SubmissionDetail } from "../../lib/admin.svelte";

  let { submissionId }: { submissionId: string } = $props();

  let detail = $state<SubmissionDetail | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let blockReason = $state("");

  async function load(id: string) {
    loading = true;
    error = null;
    notice = null;
    try {
      detail = await adminApi.submission(id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      detail = null;
    } finally {
      loading = false;
    }
  }

  async function setStatus(next: string) {
    if (busy || !detail) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const r = await adminApi.setStatus(submissionId, next);
      detail.submission.status = r.status;
      notice = `Status set to ${r.status}.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function block(blocked: boolean) {
    if (busy || !detail) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await adminApi.block(detail.submission.submitterId, blocked, blockReason.trim() || undefined);
      notice = blocked ? "Submitter blocked." : "Submitter unblocked.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (adminAuth.token) void load(submissionId);
  });
</script>

<a class="back" href="#/admin">← Queue</a>

{#if !adminAuth.token}
  <p class="state">Sign in above to inspect this submission.</p>
{:else if loading}
  <p class="state">Loading…</p>
{:else if error && !detail}
  <p class="state error">{error}</p>
{:else if detail}
  <h1>Submission</h1>
  <p class="sub">
    <span class="mono">{detail.submission.submissionId}</span> ·
    <span class="tag">{detail.submission.status}</span>
    {#if detail.submission.projectionError}
      <span class="tag warn">projection failed</span>
    {/if}
  </p>

  {#if detail.submission.projectionError}
    <p class="state error">
      Projection failed for this submission: <span class="mono">{detail.submission.projectionError}</span>.
      The raw capture is safe in R2; rerun it via <span class="mono">/reprocess</span>.
    </p>
  {/if}

  <div class="recordbox">
    <div class="stat">
      <div class="k">Submitter</div>
      <div class="v" style="font-size:14px" title={detail.submission.submitterId}>
        {detail.submission.submitterId.slice(0, 16)}…
      </div>
    </div>
    <div class="stat">
      <div class="k">Received (UTC)</div>
      <div class="v" style="font-size:14px">
        {new Date(detail.submission.receivedAt).toISOString().slice(0, 16).replace("T", " ")}
      </div>
    </div>
    <div class="stat">
      <div class="k">Lists</div>
      <div class="v">{detail.lists.length}</div>
    </div>
  </div>

  {#if notice}<p class="state" style="padding:10px 0;color:var(--accent-ink)">{notice}</p>{/if}
  {#if error}<p class="state error" style="padding:10px 0">{error}</p>{/if}

  <div class="actions">
    <button
      class="danger"
      disabled={busy || detail.submission.status === "quarantined"}
      onclick={() => setStatus("quarantined")}>Quarantine</button
    >
    <button
      class="danger"
      disabled={busy || detail.submission.status === "rejected"}
      onclick={() => setStatus("rejected")}>Reject</button
    >
    <button
      class="ghost"
      disabled={busy || detail.submission.status === "accepted"}
      onclick={() => setStatus("accepted")}>Re-accept</button
    >
  </div>

  <div class="block">
    <input placeholder="block reason (optional)" bind:value={blockReason} />
    <button class="danger" disabled={busy} onclick={() => block(true)}>Block submitter</button>
    <button class="ghost" disabled={busy} onclick={() => block(false)}>Unblock</button>
  </div>

  {#if detail.lists.length === 0}
    <p class="state">
      This submission projected no lists (the parser may have failed). The raw capture is retained in
      R2 and can be re-derived via <span class="mono">/reprocess</span>.
    </p>
  {:else}
    {#each detail.lists as l (l.id)}
      <section class="listcard">
        <div class="listhead">
          <h2>
            {#if detail.submission.status === "accepted"}
              <a href={`#/lists/${l.id}`}>{titleize(l.factionId)}</a>
            {:else}
              {titleize(l.factionId)}
            {/if}
          </h2>
          <span class="meta">
            {l.playerName ?? "–"} · consent <span class="tag">{l.consent ?? "unknown"}</span> ·
            {l.points ?? "–"} pts · place {l.placement.placing ?? "–"} ·
            <span class="mono">{l.importFormat ?? "–"}</span>
          </span>
        </div>
        {#if l.units.length === 0}
          <p class="state" style="padding:10px 0">No units resolved for this list.</p>
        {:else}
          <table>
            <thead><tr><th>Unit</th><th class="num">Models</th><th>Flags</th></tr></thead>
            <tbody>
              {#each l.units as u, i (i)}
                <tr>
                  <td>
                    {u.resolved ? titleize(u.unitId) : u.rawName}
                    {#if !u.resolved}<span class="tag">unresolved</span>{/if}
                  </td>
                  <td class="num">{u.modelCount}</td>
                  <td>
                    {#if u.isWarlord}<span class="tag pill-warlord">Warlord</span>{/if}
                    {#if u.enhancementId}<span class="tag">{titleize(u.enhancementId)}</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/each}
  {/if}
{/if}

<style>
  .actions,
  .block {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin: 14px 0;
  }
  .block input {
    flex: 1;
    min-width: 220px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 8px;
    padding: 7px 10px;
    font: inherit;
  }
  button {
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    border: 1px solid var(--line);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button.danger {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  button.ghost {
    background: var(--panel);
    color: var(--ink);
  }
  .listcard {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  .listhead {
    margin-bottom: 8px;
  }
  .listhead h2 {
    font-size: 17px;
    margin: 0 0 4px;
  }
  .listhead .meta {
    color: var(--muted);
    font-size: 13px;
  }
</style>
