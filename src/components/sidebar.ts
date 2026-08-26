import { h } from "@/lib/dom";
import { filterStore } from "@/state";
import { getVisiblePatterns } from "@/lib/visiblePatterns";
import { navigateTo, getRoute } from "@/lib/router";
import { categoryColor } from "@/lib/badges";
import type { Pattern, PatternCategory, Framework, Complexity } from "@/types";

const ALL_CATEGORIES: PatternCategory[] = [
  "Orchestration & Control Loops",
  "Tooling & MCP Protocols",
  "External Connectors & State Sync",
  "Multi-Agent Collaboration",
  "Resilience & Governance",
];

const ALL_FRAMEWORKS: Framework[] = [
  "LangGraph",
  "AutoGen",
  "CrewAI",
  "Raw TypeScript",
  "Raw Python",
  "MCP Server",
  "LlamaIndex",
];

const ALL_COMPLEXITIES: Complexity[] = ["Beginner", "Intermediate", "Production-Grade"];

function filterChip(
  label: string,
  active: boolean,
  onClick: () => void,
  extraClass = ""
): HTMLElement {
  const chip = h(
    "button",
    {
      type: "button",
      class: `text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-accent-600 border-accent-600 text-white"
          : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent-400"
      } ${extraClass}`,
    },
    [label]
  );
  chip.addEventListener("click", onClick);
  return chip;
}

export function mountSidebar(container: HTMLElement, patterns: Pattern[]): () => void {
  function render(): void {
    container.innerHTML = "";
    const visible = getVisiblePatterns(patterns);
    const route = getRoute();

    const filterSection = h("div", { class: "space-y-4" }, [
      h("div", {}, [
        h(
          "h3",
          { class: "text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2" },
          ["Category"]
        ),
        h(
          "div",
          { class: "flex flex-wrap gap-1.5" },
          ALL_CATEGORIES.map((c) =>
            filterChip(c, filterStore.state.categories.has(c), () => {
              filterStore.toggleCategory(c);
            })
          )
        ),
      ]),
      h("div", {}, [
        h(
          "h3",
          { class: "text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2" },
          ["Framework"]
        ),
        h(
          "div",
          { class: "flex flex-wrap gap-1.5" },
          ALL_FRAMEWORKS.map((f) =>
            filterChip(f, filterStore.state.frameworks.has(f), () => {
              filterStore.toggleFramework(f);
            })
          )
        ),
      ]),
      h("div", {}, [
        h(
          "h3",
          { class: "text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2" },
          ["Complexity"]
        ),
        h(
          "div",
          { class: "flex flex-wrap gap-1.5" },
          ALL_COMPLEXITIES.map((c) =>
            filterChip(c, filterStore.state.complexities.has(c), () => {
              filterStore.toggleComplexity(c);
            })
          )
        ),
      ]),
    ]);

    if (filterStore.hasActiveFilters()) {
      const clearBtn = h(
        "button",
        {
          type: "button",
          class:
            "text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline mt-3",
        },
        ["Clear all filters"]
      );
      clearBtn.addEventListener("click", () => {
        filterStore.clearFilters();
        const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
        if (searchInput) searchInput.value = "";
      });
      filterSection.append(clearBtn);
    }

    const navList = h(
      "nav",
      { class: "mt-5 space-y-0.5", "aria-label": "Pattern list" },
      visible.map((p) => {
        const active = route.name === "pattern" && route.slug === p.slug;
        const item = h(
          "button",
          {
            type: "button",
            class: `w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
              active
                ? "bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300 font-medium"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`,
          },
          [
            h("span", {
              class: `w-1.5 h-1.5 rounded-full shrink-0 ${categoryColor[p.category].split(" ")[0]}`,
            }),
            h("span", { class: "truncate" }, [p.name]),
          ]
        );
        item.addEventListener("click", () => navigateTo({ name: "pattern", slug: p.slug }));
        return item;
      })
    );

    if (visible.length === 0) {
      navList.append(
        h("p", { class: "text-sm text-slate-400 px-2.5 py-2" }, [
          "No patterns match the current filters.",
        ])
      );
    }

    const countLabel = h(
      "p",
      { class: "text-xs text-slate-400 mt-4 mb-1 px-0.5" },
      [`${visible.length} of ${patterns.length} patterns`]
    );

    container.append(filterSection, countLabel, navList);
  }

  render();
  const unsubscribe = filterStore.subscribe(render);
  window.addEventListener("hashchange", render);
  return () => {
    unsubscribe();
    window.removeEventListener("hashchange", render);
  };
}
