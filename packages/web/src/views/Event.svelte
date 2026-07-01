<script lang="ts">
  import { api, titleize, type EventSummary, type EventListEntry } from "../lib/api";

  let { eventId }: { eventId: string } = $props();

  let event = $state<EventSummary | null>(null);
  let lists = $state<EventListEntry[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load(id: string) {
    loading = true;
    error = null;
    try {
      const r = await api.event(id);
      event = r.event;
      lists = r.lists;
    } catch (e) {
      error = (e as Error).message;
      event = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(eventId);
  });
</script>

<a class="back" href="#/events">← Events</a>

{#if loading}
  <p class="state">Loading…</p>
{:else if error}
  <p class="state error">{error}</p>
{:else if event}
  <h1>{event.name ?? event.eventId}</h1>
  <p class="sub">
    {#if event.date}{new Date(event.date).toLocaleDateString()} · {/if}{event.format ?? "–"} ·
    {event.region ?? "–"}
  </p>
  <table>
    <thead>
      <tr><th>#</th><th>Faction</th><th>Player</th><th class="num">Pts</th><th class="num">W-L-D</th></tr>
    </thead>
    <tbody>
      {#each lists as l (l.id)}
        <tr style="cursor:pointer" onclick={() => (window.location.hash = `#/lists/${l.id}`)}>
          <td>{l.placement.placing ?? "–"}</td>
          <td><a href={`#/lists/${l.id}`}>{titleize(l.factionId)}</a></td>
          <td>{l.playerName ?? "–"}</td>
          <td class="num">
            {l.points ?? "–"}{#if l.warningCount}<span
                class="warnmark"
                title={`${l.warningCount} parse warning(s); see the list page`}>*</span
              >{/if}
          </td>
          <td class="num">{l.placement.wins ?? 0}-{l.placement.losses ?? 0}-{l.placement.draws ?? 0}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
