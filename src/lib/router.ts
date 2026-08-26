export type Route = { name: "catalog" } | { name: "pattern"; slug: string };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (clean.startsWith("pattern/")) {
    return { name: "pattern", slug: decodeURIComponent(clean.slice("pattern/".length)) };
  }
  return { name: "catalog" };
}

export function getRoute(): Route {
  return parseHash(window.location.hash);
}

export function navigateTo(route: Route): void {
  const hash =
    route.name === "catalog" ? "#/" : `#/pattern/${encodeURIComponent(route.slug)}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    onRouteChange?.(route);
  }
}

let onRouteChange: ((route: Route) => void) | null = null;

export function initRouter(handler: (route: Route) => void): void {
  onRouteChange = handler;
  window.addEventListener("hashchange", () => handler(getRoute()));
  handler(getRoute());
}
