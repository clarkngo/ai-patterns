import "@/style.css";
import { h } from "@/lib/dom";
import { initThemeToggle } from "@/lib/theme";
import { initRouter, navigateTo, getRoute } from "@/lib/router";
import { buildSearchIndex } from "@/lib/search";
import { reinitMermaidTheme } from "@/lib/mermaid";
import { filterStore } from "@/state";
import { patterns, patternsBySlug } from "@/data/patterns";
import { mountSidebar } from "@/components/sidebar";
import { mountCatalogView } from "@/views/catalog";
import { renderPatternDetail } from "@/views/patternDetail";

buildSearchIndex(patterns);

const app = document.getElementById("app")!;

// --- Header ---
const searchInput = h("input", {
  id: "search-input",
  type: "search",
  placeholder: "Search patterns, tags, use cases…",
  class:
    "w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500",
}) as HTMLInputElement;
searchInput.addEventListener("input", () => filterStore.setQuery(searchInput.value));

const themeBtn = h(
  "button",
  {
    type: "button",
    class:
      "text-sm font-medium px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0",
  },
  []
) as HTMLButtonElement;
initThemeToggle(themeBtn);

const mobileFiltersBtn = h(
  "button",
  {
    type: "button",
    class:
      "md:hidden text-sm font-medium px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0",
  },
  ["☰ Filters"]
) as HTMLButtonElement;

const logo = h(
  "button",
  { type: "button", class: "flex items-center gap-2 shrink-0" },
  [
    h("span", { class: "text-lg" }, ["🕸️"]),
    h("span", { class: "font-bold text-lg text-slate-900 dark:text-white tracking-tight" }, [
      "Agent Patterns",
    ]),
  ]
);
logo.addEventListener("click", () => navigateTo({ name: "catalog" }));

const header = h(
  "header",
  {
    class:
      "sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-canvas-light/90 dark:bg-canvas-dark/90 backdrop-blur",
  },
  [
    h(
      "div",
      {
        class:
          "max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 justify-between flex-wrap",
      },
      [logo, h("div", { class: "flex-1 min-w-[200px] max-w-md" }, [searchInput]), h("div", { class: "flex items-center gap-2" }, [mobileFiltersBtn, themeBtn])]
    ),
  ]
);

// --- Layout: sidebar + main content ---
const aside = h("aside", {
  id: "sidebar",
  class:
    "hidden md:block md:w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 px-4 py-6 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto",
});
const mobileOverlayClasses = [
  "block",
  "fixed",
  "inset-0",
  "z-30",
  "w-full",
  "bg-canvas-light",
  "dark:bg-canvas-dark",
  "h-screen",
];

function setMobileFiltersOpen(open: boolean): void {
  aside.classList.toggle("hidden", !open);
  mobileOverlayClasses.forEach((c) => aside.classList.toggle(c, open));
}

mobileFiltersBtn.addEventListener("click", () => {
  setMobileFiltersOpen(!mobileOverlayClasses.every((c) => aside.classList.contains(c)));
});

const main = h("main", {
  id: "main-content",
  class: "flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-7xl",
});

const layout = h("div", { class: "max-w-7xl mx-auto flex" }, [aside, main]);

const footer = h(
  "footer",
  {
    class:
      "border-t border-slate-200 dark:border-slate-800 mt-10 py-8 text-center text-sm text-slate-400",
  },
  [
    "Agent Patterns — an open catalog of autonomous multi-agent architectures. ",
    h(
      "a",
      {
        href: "https://github.com/",
        class: "text-accent-600 dark:text-accent-400 hover:underline",
      },
      ["Contribute a pattern →"]
    ),
  ]
);

app.append(header, layout, footer);

const closeSidebarBtn = h(
  "button",
  {
    type: "button",
    class:
      "md:hidden mb-4 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800",
  },
  ["✕ Close"]
);
closeSidebarBtn.addEventListener("click", () => setMobileFiltersOpen(false));
const sidebarContent = h("div", {});
aside.append(closeSidebarBtn, sidebarContent);

mountSidebar(sidebarContent, patterns);

let teardownCurrentView: (() => void) | null = null;

function renderRoute(route: ReturnType<typeof getRoute>): void {
  teardownCurrentView?.();
  teardownCurrentView = null;
  main.innerHTML = "";
  setMobileFiltersOpen(false);

  if (route.name === "pattern") {
    const pattern = patternsBySlug.get(route.slug);
    if (pattern) {
      main.append(renderPatternDetail(pattern));
      window.scrollTo({ top: 0 });
    } else {
      main.append(
        h("div", { class: "py-16 text-center text-slate-400" }, [
          `No pattern found for "${route.slug}".`,
        ])
      );
    }
  } else {
    teardownCurrentView = mountCatalogView(main, patterns);
  }
}

initRouter(renderRoute);

// Re-render the current route so Mermaid diagrams re-theme on toggle.
window.addEventListener("themechange", () => {
  reinitMermaidTheme();
  renderRoute(getRoute());
});
