<script lang="ts">
  import { adminApi, adminAuth, type QueueEntry } from "../../lib/admin.svelte";

  const STATUSES = ["accepted", "pending", "quarantined", "rejected"] as const;
  type Status = (typeof STATUSES)[number];

  let status = $state<Status>("accepted");
  let rows = $state<QueueEntry[]>([]);
  let nextKey = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function load(s: Status, cursor?: string) {
    loading = true;
    error = null;
    try {
      const r = await adminApi.queue({ status: s, cursor });
      rows = cursor ? [...rows, ...r.data] : r.data;
      nextKey = r.nextKey;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // Reload from the top whenever the status tab changes or a session begins.
  $effect(() => {
    if (adminAuth.token) void load(status);
  });
</script>

<h1>Moderation queue</h1>
<p class="sub">
  Lists are public on capture; this is the reactive firehose. Open a submission to inspect it, then
  quarantine, reject, or re-accept it.
</p>

{#if !adminAuth.token}
  <p class="state">Sign in above to view the queue.</p>
{:else}
  <div class="tabs">
    {#each STATUSES as s (s)}
      <button class={status === s ? "active" : ""} onclick={() => (status = s)}>{s}</button>
    {/each}
  </div>

  {#if error}<p class="state error">{error}</p>{/if}
  {#if loading && rows.length === 0}
    <p class="state">Loading…</p>
  {:else if rows.length === 0}
    <p class="state">No {status} submissions.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Received (UTC)</th><th>Submitter</th><th class="num">Lists</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.submissionId)}
          <tr
            style="cursor:pointer"
            onclick={() => (window.location.hash = `#/admin/submissions/${r.submissionId}`)}
          >
            <td class="mono">{new Date(r.receivedAt).toISOString().slice(0, 16).replace("T", " ")}</td>
            <td class="mono" title={r.submitterId}>{r.submitterId.slice(0, 12)}…</td>
            <td class="num">{r.listCount}</td>
            <td>
              <span class="tag">{r.status}</span>
              {#if r.projectionError}
                <span class="tag warn" title={r.projectionError}>projection failed</span>
              {/if}
            </td>
            <td><a href={`#/admin/submissions/${r.submissionId}`}>Review →</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if nextKey}
      <button class="more" onclick={() => load(status, nextKey ?? undefined)}>Load more</button>
    {/if}
  {/if}
{/if}
