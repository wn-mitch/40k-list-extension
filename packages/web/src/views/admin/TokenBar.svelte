<script lang="ts">
  import { adminAuth, signIn, signOut } from "../../lib/admin.svelte";

  let secret = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit() {
    if (busy || !secret.trim()) return;
    busy = true;
    error = null;
    try {
      await signIn(secret);
      secret = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="tokenbar">
  {#if adminAuth.token}
    <span class="who">Signed in as <span class="mono">{adminAuth.owner || "…"}</span></span>
    <button class="ghost" onclick={signOut}>Sign out</button>
  {:else}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        type="password"
        placeholder="access key or entitlement token"
        autocomplete="off"
        bind:value={secret}
      />
      <button type="submit" disabled={busy || !secret.trim()}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <p class="hint">
      Sign in with an alpacasoft access key (redeemed in-browser) or a pre-redeemed entitlement token.
      The token owner must be in <span class="mono">ADMIN_OWNERS</span>.
    </p>
  {/if}
  {#if error}<p class="state error">{error}</p>{/if}
</div>

<style>
  .tokenbar {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 10px;
    padding: 12px 14px;
    margin: 0 0 20px;
  }
  form {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  input {
    flex: 1;
    min-width: 0;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    padding: 8px 10px;
    font: inherit;
  }
  button {
    background: var(--accent);
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .who {
    color: var(--muted);
    margin-right: 12px;
  }
  .hint {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    margin: 10px 0 0;
  }
</style>
