<script lang="ts">
  import { api, titleize, type FactionStat, type UnitStat, type BifEntry } from "../lib/api";

  type Tab = "factions" | "units" | "bif";
  let tab = $state<Tab>("factions");
  let factions = $state<FactionStat[]>([]);
  let units = $state<UnitStat[]>([]);
  let bif = $state<BifEntry[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load(t: Tab) {
    loading = true;
    error = null;
    try {
      if (t === "factions") factions = (await api.statsFactions()).data;
      else if (t === "units") units = (await api.statsUnits()).data;
      else bif = (await api.statsBif()).data;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(tab);
  });
</script>

<h1>Statistics</h1>
<p class="sub">Across all accepted lists.</p>

<div class="tabs">
  <button class={tab === "factions" ? "active" : ""} onclick={() => (tab = "factions")}>Faction rep</button>
  <button class={tab === "units" ? "active" : ""} onclick={() => (tab = "units")}>Most-played units</button>
  <button class={tab === "bif" ? "active" : ""} onclick={() => (tab = "bif")}>Best in faction</button>
</div>

{#if loading}
  <p class="state">Loading…</p>
{:else if error}
  <p class="state error">{error}</p>
{:else if tab === "factions"}
  <table>
    <thead><tr><th>Faction</th><th class="num">Lists</th><th>Share</th></tr></thead>
    <tbody>
      {#each factions as f (f.factionId)}
        <tr>
          <td>{titleize(f.factionId)}</td>
          <td class="num">{f.count}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="bar" style={`width:${Math.max(2, f.share * 160)}px`}></div>
              <span class="mono">{(f.share * 100).toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else if tab === "units"}
  <table>
    <thead><tr><th>Unit</th><th class="num">Lists</th><th>Share</th></tr></thead>
    <tbody>
      {#each units as u (u.unitId)}
        <tr>
          <td>{titleize(u.unitId)}</td>
          <td class="num">{u.count}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="bar" style={`width:${Math.max(2, u.share * 160)}px`}></div>
              <span class="mono">{(u.share * 100).toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else}
  <table>
    <thead><tr><th>Faction</th><th>Player</th><th class="num">Placing</th><th class="num">Pts</th></tr></thead>
    <tbody>
      {#each bif as b (b.factionId)}
        <tr style="cursor:pointer" onclick={() => (window.location.hash = `#/lists/${b.listId}`)}>
          <td><a href={`#/lists/${b.listId}`}>{titleize(b.factionId)}</a></td>
          <td>{b.playerName ?? "–"}</td>
          <td class="num">{b.placing}</td>
          <td class="num">{b.points ?? "–"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
