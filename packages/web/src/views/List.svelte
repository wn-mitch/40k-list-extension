<script lang="ts">
  import { api, titleize, type ListDetail } from "../lib/api";

  let { listId }: { listId: string } = $props();

  let list = $state<ListDetail | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // The as-pasted and computed totals disagree; both are shown, neither is
  // "corrected". Only meaningful when both are present.
  const mismatch = $derived(
    list != null &&
      list.pointsReported != null &&
      list.pointsComputed != null &&
      list.pointsReported !== list.pointsComputed,
  );

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
    {list.playerName ?? "–"} · {list.battleSize ?? "–"} ·
    {#if mismatch}
      {list.pointsReported} pts as pasted ({list.pointsComputed} computed)
      <span class="tag warn">points mismatch</span>
    {:else}
      {list.points ?? "–"} pts
    {/if}
    · <span class="mono">{list.importFormat ?? "–"}</span>
  </p>

  <div class="recordbox">
    <div class="stat"><div class="k">Placing</div><div class="v">{list.placement.placing ?? "–"}</div></div>
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

  {#if list.warnings != null && list.warnings.length > 0}
    <section class="warnings">
      <h2>Parse warnings</h2>
      <ul>
        {#each list.warnings as w, i (i)}
          <li>
            <span class="tag warn mono">{w.code}</span>
            {w.message}{#if w.raw_name}&nbsp;(<span class="mono">{w.raw_name}</span>){/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <table>
    <thead><tr><th>Unit</th><th class="num">Models</th><th>Flags</th></tr></thead>
    <tbody>
      {#each list.units as u, i (i)}
        <tr>
          <td>
            {u.resolved ? titleize(u.unitId) : u.rawName}
            {#if !u.resolved}<span class="tag warn">unresolved</span>{/if}
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

  <p class="state disclaimer">
    Totals and names are as pasted by the player, parsed on a best-effort basis. This site archives
    lists; it does not validate legality.
  </p>
{/if}

<style>
  .warnings {
    border: 1px solid var(--warn);
    border-radius: 10px;
    padding: 10px 16px;
    margin: 16px 0;
  }
  .warnings h2 {
    font-size: 14px;
    margin: 4px 0;
    color: var(--warn-ink);
  }
  .warnings ul {
    margin: 6px 0;
    padding-left: 18px;
  }
  .warnings li {
    margin: 4px 0;
    font-size: 14px;
  }
  .disclaimer {
    margin-top: 18px;
    font-size: 13px;
  }
</style>
