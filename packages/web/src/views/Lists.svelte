<script lang="ts">
  import { api, titleize, type ListSummary } from "../lib/api";

  let faction = $state("");
  let format = $state("");
  let lists = $state<ListSummary[]>([]);
  let nextKey = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load(f: string, fmt: string, cursor?: string) {
    loading = true;
    error = null;
    try {
      const r = await api.lists({
        factionId: f || undefined,
        format: fmt || undefined,
        cursor,
      });
      lists = cursor ? [...lists, ...r.data] : r.data;
      nextKey = r.nextKey;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  // Refetches whenever the filters change (reads faction/format).
  $effect(() => {
    void load(faction, format);
  });
</script>

<h1>Lists</h1>
<p class="sub">Accepted, normalized army lists. Filter by faction id or format.</p>

<div class="controls">
  <input placeholder="faction id (e.g. chaos-knights)" bind:value={faction} />
  <input placeholder="format (e.g. newrecruit-simple)" bind:value={format} />
</div>

{#if error}<p class="state error">{error}</p>{/if}
{#if loading && lists.length === 0}
  <p class="state">Loading…</p>
{:else if lists.length === 0}
  <p class="state">No matching lists.</p>
{:else}
  <table>
    <thead>
      <tr><th>Faction</th><th>Player</th><th>Event</th><th class="num">Pts</th><th class="num">Place</th></tr>
    </thead>
    <tbody>
      {#each lists as l (l.id)}
        <tr style="cursor:pointer" onclick={() => (window.location.hash = `#/lists/${l.id}`)}>
          <td><a href={`#/lists/${l.id}`}>{titleize(l.factionId)}</a></td>
          <td>{l.playerName ?? "—"}</td>
          <td class="mono">{l.eventId ?? "—"}</td>
          <td class="num">{l.points ?? "—"}</td>
          <td class="num">{l.placement.placing ?? "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if nextKey}
    <button class="more" onclick={() => load(faction, format, nextKey ?? undefined)}>Load more</button>
  {/if}
{/if}
