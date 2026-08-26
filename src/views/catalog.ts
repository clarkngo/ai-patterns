import { h } from "@/lib/dom";
import { renderPatternCard } from "@/components/patternCard";
import { getVisiblePatterns } from "@/lib/visiblePatterns";
import { filterStore } from "@/state";
import type { Pattern } from "@/types";

export function mountCatalogView(container: HTMLElement, patterns: Pattern[]): () => void {
  function render(): void {
    container.innerHTML = "";

    const hero = h("div", { class: "mb-8" }, [
      h(
        "h1",
        { class: "text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white" },
        ["Agent Patterns"]
      ),
      h(
        "p",
        { class: "mt-3 max-w-2xl text-slate-600 dark:text-slate-400 leading-relaxed" },
        [
          "A structured catalog of autonomous and semi-autonomous multi-agent system design patterns — orchestration loops, MCP tooling, external state sync, and resilience architectures. Every entry ships a production-oriented blueprint: state schema, execution loop, failure modes, and real-world use cases.",
        ]
      ),
    ]);

    const visible = getVisiblePatterns(patterns);
    const grid = h("div", {
      class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4",
    });

    if (visible.length === 0) {
      grid.append(
        h(
          "div",
          {
            class:
              "col-span-full text-center py-16 text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl",
          },
          ["No patterns match your search or filters."]
        )
      );
    } else {
      visible.forEach((p) => grid.append(renderPatternCard(p)));
    }

    container.append(hero, grid);
  }

  render();
  const unsubscribe = filterStore.subscribe(render);
  return unsubscribe;
}
