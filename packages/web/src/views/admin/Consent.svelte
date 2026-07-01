<script lang="ts">
  import { adminApi, adminAuth, type ConsentBody } from "../../lib/admin.svelte";

  const CONSENTS = ["opted_in", "excluded", "unknown"] as const;
  type Consent = (typeof CONSENTS)[number];

  let bcpPlayerId = $state("");
  let consent = $state<Consent>("excluded");
  let displayName = $state("");
  let error = $state<string | null>(null);
  let result = $state<string | null>(null);
  let busy = $state(false);

  async function submit() {
    if (busy) return;
    error = null;
    result = null;
    if (!bcpPlayerId.trim()) {
      error = "BCP player id is required.";
      return;
    }
    if (consent === "opted_in" && !displayName.trim()) {
      error = "A display name is required to be named.";
      return;
    }
    busy = true;
    try {
      // Mirror the server's parsePlayerConsent: a name only rides along for
      // opted_in; excluded/unknown purge identity.
      const body: ConsentBody = {
        bcpPlayerId: bcpPlayerId.trim(),
        consent,
        displayName: consent === "opted_in" ? displayName.trim() : null,
      };
      const r = await adminApi.setConsent(body);
      result = r.named
        ? `Player is now named (consent: ${r.consent}).`
        : `Consent set to ${r.consent}; the pseudonym is forced.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<h1>Consent ops</h1>
<p class="sub">
  Set a player's consent durably (survives later captures and reprocessing). Naming is opt-in;
  exclusion is identity-suppression; the anonymized list stays in aggregate stats.
</p>

{#if !adminAuth.token}
  <p class="state">Sign in above to run consent ops.</p>
{:else}
  <form
    class="consent"
    onsubmit={(e) => {
      e.preventDefault();
      void submit();
    }}
  >
    <label>
      <span>BCP player id</span>
      <input placeholder="raw BCP player id" bind:value={bcpPlayerId} />
    </label>
    <label>
      <span>Consent</span>
      <select bind:value={consent}>
        {#each CONSENTS as c (c)}
          <option value={c}>{c}</option>
        {/each}
      </select>
    </label>
    {#if consent === "opted_in"}
      <label>
        <span>Display name</span>
        <input placeholder="name to credit" bind:value={displayName} />
      </label>
    {/if}
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Apply"}</button>
  </form>

  {#if result}<p class="state" style="color:var(--accent-ink)">{result}</p>{/if}
  {#if error}<p class="state error">{error}</p>{/if}
{/if}

<style>
  .consent {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 440px;
    margin-top: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    color: var(--muted);
    font-size: 13px;
  }
  input,
  select {
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
  }
  button {
    align-self: flex-start;
    background: var(--accent);
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 9px 18px;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
