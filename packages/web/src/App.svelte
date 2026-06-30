<script lang="ts">
  import { router } from "./lib/router.svelte";
  import Events from "./views/Events.svelte";
  import EventView from "./views/Event.svelte";
  import Lists from "./views/Lists.svelte";
  import ListView from "./views/List.svelte";
  import Stats from "./views/Stats.svelte";
  import Methodology from "./views/Methodology.svelte";
  import Queue from "./views/admin/Queue.svelte";
  import Submission from "./views/admin/Submission.svelte";
  import Consent from "./views/admin/Consent.svelte";
  import TokenBar from "./views/admin/TokenBar.svelte";
  import { adminAuth } from "./lib/admin.svelte";

  type Match = {
    view:
      | "events"
      | "event"
      | "lists"
      | "list"
      | "stats"
      | "methodology"
      | "admin-queue"
      | "admin-submission"
      | "admin-consent";
    param?: string;
  };

  function matchRoute(path: string): Match {
    const e = path.match(/^\/events\/(.+)$/);
    if (e) return { view: "event", param: decodeURIComponent(e[1]) };
    const l = path.match(/^\/lists\/(.+)$/);
    if (l) return { view: "list", param: decodeURIComponent(l[1]) };
    if (path === "/lists") return { view: "lists" };
    if (path === "/stats") return { view: "stats" };
    if (path === "/methodology") return { view: "methodology" };
    const adminSub = path.match(/^\/admin\/submissions\/(.+)$/);
    if (adminSub) return { view: "admin-submission", param: decodeURIComponent(adminSub[1]) };
    if (path === "/admin/consent") return { view: "admin-consent" };
    if (path === "/admin") return { view: "admin-queue" };
    return { view: "events" };
  }

  const matched = $derived(matchRoute(router.path));

  function navClass(prefix: string): string {
    const p = router.path;
    const active =
      p === prefix ||
      p.startsWith(`${prefix}/`) ||
      (prefix === "/events" && p === "/");
    return active ? "active" : "";
  }
</script>

<header class="top">
  <div class="wrap">
    <span class="brand">40kdc<span class="dot">·</span>meta</span>
    <nav>
      <a href="#/events" class={navClass("/events")}>Events</a>
      <a href="#/lists" class={navClass("/lists")}>Lists</a>
      <a href="#/stats" class={navClass("/stats")}>Stats</a>
      <a href="#/methodology" class={navClass("/methodology")}>Methodology</a>
      {#if adminAuth.token}
        <a href="#/admin" class={navClass("/admin")}>Admin</a>
      {/if}
    </nav>
  </div>
</header>

<main class="wrap">
  {#if matched.view === "event"}
    <EventView eventId={matched.param ?? ""} />
  {:else if matched.view === "list"}
    <ListView listId={matched.param ?? ""} />
  {:else if matched.view === "lists"}
    <Lists />
  {:else if matched.view === "stats"}
    <Stats />
  {:else if matched.view === "methodology"}
    <Methodology />
  {:else if matched.view === "admin-queue"}
    <TokenBar />
    <Queue />
  {:else if matched.view === "admin-submission"}
    <TokenBar />
    <Submission submissionId={matched.param ?? ""} />
  {:else if matched.view === "admin-consent"}
    <TokenBar />
    <Consent />
  {:else}
    <Events />
  {/if}
</main>
