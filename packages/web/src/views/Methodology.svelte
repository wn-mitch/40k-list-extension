<script lang="ts">
  // Static view — no API call. Content mirrors METHODOLOGY.md, with the
  // player-side consent contract surfaced for people whose lists are captured.
  const issuesUrl = "https://github.com/<owner>/40kdc-meta/issues";
  const methodologyUrl = "https://github.com/<owner>/40kdc-meta/blob/main/METHODOLOGY.md";
  const repoUrl = "https://github.com/<owner>/40kdc-meta";
</script>

<section class="prose">
  <h1>Methodology &amp; privacy</h1>
  <p class="sub">What the capture extension does, what it doesn't, and your choices.</p>

  <h2>What the extension captures</h2>
  <ul>
    <li>
      <strong>Only BCP API responses you already receive.</strong> While you browse Best
      Coast Pairings, the extension observes the same JSON the BCP site itself requests
      (event, list, and pairing data). It reads the bytes BCP already sent to your browser.
    </li>
    <li>
      <strong>BCP domains only.</strong> The extension is scoped to
      <span class="mono">*.bestcoastpairings.com</span>. It does not run on, observe, or
      capture any other website, and it reads only JSON network responses — not page content.
    </li>
    <li>
      <strong>Not auth or static noise.</strong> Auth endpoints and static assets are
      filtered out before anything is buffered.
    </li>
  </ul>

  <h2>Nothing leaves your browser until you opt in</h2>
  <ul>
    <li>
      <strong>Consent is OFF by default.</strong> Captured responses are dropped — never
      buffered, never queued — until you flip the consent toggle ON in the extension popup.
    </li>
    <li>
      <strong>You can stop at any time.</strong> Toggle consent OFF and buffering/sending
      stops immediately; "Clear log" empties the pending buffer and the activity log.
    </li>
  </ul>

  <h2>You always see when data leaves</h2>
  <ul>
    <li>A <strong>toast</strong> appears on the BCP page after every successful upload, naming the destination host.</li>
    <li>An <strong>activity log</strong> in the popup records each upload, so there is a visible, local history of everything sent.</li>
  </ul>

  <h2>What identifies a submission</h2>
  <p>
    Submissions carry only an <strong>anonymous, per-install <span class="mono">submitterId</span></strong>
    (a random UUID). It identifies the <em>source install</em>, not you — no account, name,
    email, or device information.
  </p>

  <h2>For players whose lists are captured</h2>
  <p>
    Published lists are shown <strong>anonymized</strong>: each player is rendered as a
    <span class="mono">player_&lt;8 hex&gt;</span> pseudonym derived from their BCP id, never
    a real name. Only <em>accepted</em> lists are ever made public. You have two explicit
    choices, both honored by a maintainer:
  </p>
  <ul>
    <li>
      <strong>Be named (opt in).</strong> Ask to have your list credited under your name.
      The maintainer records this and your chosen display name appears in place of the
      pseudonym.
    </li>
    <li>
      <strong>Be excluded (opt out).</strong> Ask to have your identity suppressed. Your
      name is purged and the pseudonym is forced; the anonymized list itself remains as
      part of the aggregate meta data (it still counts in statistics), but it can no longer
      be tied to you.
    </li>
  </ul>
  <p>
    Both requests are made out-of-band — open an issue on the
    <a href={issuesUrl} target="_blank" rel="noopener">repository issue tracker</a> — and
    are applied durably, surviving later captures and reprocessing.
  </p>

  <h2>More</h2>
  <p>
    Read the full <a href={methodologyUrl} target="_blank" rel="noopener">METHODOLOGY.md</a>
    or browse the complete <a href={repoUrl} target="_blank" rel="noopener">source</a> —
    the extension and the backend Worker are both public.
  </p>
</section>

<style>
  .prose {
    max-width: 680px;
  }
  .prose h2 {
    font-size: 17px;
    margin: 28px 0 8px;
    color: var(--ink);
  }
  .prose p {
    color: var(--muted);
    line-height: 1.6;
    margin: 0 0 12px;
  }
  .prose ul {
    margin: 0 0 16px;
    padding-left: 20px;
  }
  .prose li {
    color: var(--muted);
    line-height: 1.6;
    margin: 0 0 8px;
  }
  .prose strong {
    color: var(--ink);
    font-weight: 600;
  }
</style>
