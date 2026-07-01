<script lang="ts">
  import { api, type EventSummary } from "../lib/api";

  let events = $state<EventSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load() {
    loading = true;
    error = null;
    try {
      events = (await api.events()).data;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<h1>Events</h1>
<p class="sub">Tournaments with accepted, normalized army lists.</p>

{#if loading}
  <p class="state">Loading…</p>
{:else if error}
  <p class="state error">{error}</p>
{:else if events.length === 0}
  <p class="state">No events yet.</p>
{:else}
  <div class="grid">
    {#each events as e (e.eventId)}
      <a class="card" href={`#/events/${encodeURIComponent(e.eventId)}`}>
        <div class="name">{e.name ?? e.eventId}</div>
        <div class="meta">
          {#if e.date}{new Date(e.date).toLocaleDateString()} · {/if}{e.format ?? "–"} ·
          <span class="count">{e.listCount}</span> lists
        </div>
      </a>
    {/each}
  </div>
{/if}
