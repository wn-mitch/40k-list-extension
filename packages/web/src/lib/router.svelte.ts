// Tiny hash router as shared reactive state (Svelte 5 runes).

function parse(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export const router = $state({ path: parse() });

window.addEventListener("hashchange", () => {
  router.path = parse();
});

export function navigate(to: string): void {
  window.location.hash = to;
}
