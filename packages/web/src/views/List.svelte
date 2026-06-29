<script lang="ts">
  import { api, titleize, type ListDetail } from "../lib/api";

  let { listId }: { listId: string } = $props();

  let list = $state<ListDetail | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load(id: string) {
    loading = true;
    error = null;
    try {
      list = (await api.list(id)).list;
    } catch (e) {
      error = (e as Error).message;
      list = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(listId);
  });
</script>

<a class="back" href="#/lists">← Lists</a>

{#if loading}
  <p class="state">Loading…</p>
{:else if error}
  <p class="state error">{error}</p>
{:else if list}
  <h1>{titleize(list.factionId)}</h1>
  <p class="sub">
    {list.playerName ?? "—"} · {list.battleSize ?? "—"} · {list.points ?? "—"} pts ·
    <span class="mono">{list.importFormat ?? "—"}</span>
  </p>

  <div class="recordbox">
    <div class="stat"><div class="k">Placing</div><div class="v">{list.placement.placing ?? "—"}</div></div>
    <div class="stat">
      <div class="k">Record</div>
      <div class="v">{list.placement.wins ?? 0}-{list.placement.losses ?? 0}-{list.placement.draws ?? 0}</div>
    </div>
    {#if list.detachmentIds.length}
      <div class="stat">
        <div class="k">Detachment</div>
        <div class="v" style="font-size:15px">{list.detachmentIds.map(titleize).join(", ")}</div>
      </div>
    {/if}
  </div>

  <table>
    <thead><tr><th>Unit</th><th class="num">Models</th><th>Flags</th></tr></thead>
    <tbody>
      {#each list.units as u, i (i)}
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
