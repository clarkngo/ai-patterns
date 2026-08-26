import { h } from "@/lib/dom";
import { navigateTo } from "@/lib/router";
import { complexityColor, categoryColor, categoryAbbreviation } from "@/lib/badges";
import type { Pattern } from "@/types";

export function renderPatternCard(pattern: Pattern): HTMLElement {
  const card = h(
    "article",
    {
      class:
        "group cursor-pointer rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark p-5 hover:border-accent-400 dark:hover:border-accent-500 hover:shadow-lg transition-all flex flex-col gap-3",
      tabindex: "0",
      role: "link",
      "aria-label": `Open pattern: ${pattern.name}`,
    },
    [
      h("div", { class: "flex flex-wrap gap-2" }, [
        h(
          "span",
          {
            class: `text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColor[pattern.category]}`,
          },
          [categoryAbbreviation[pattern.category]]
        ),
        h(
          "span",
          {
            class: `text-xs font-semibold px-2 py-0.5 rounded-full ${complexityColor[pattern.complexity]}`,
          },
          [pattern.complexity]
        ),
      ]),
      h(
        "h3",
        {
          class:
            "text-lg font-semibold text-slate-900 dark:text-white group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors",
        },
        [pattern.name]
      ),
      h("p", { class: "text-sm text-slate-600 dark:text-slate-400 line-clamp-3" }, [
        pattern.summary,
      ]),
      h("div", { class: "flex flex-wrap gap-1.5 mt-auto pt-2" }, [
        ...pattern.frameworks.slice(0, 3).map((f) =>
          h(
            "span",
            {
              class:
                "text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
            },
            [f]
          )
        ),
        pattern.frameworks.length > 3
          ? h(
              "span",
              {
                class:
                  "text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              },
              [`+${pattern.frameworks.length - 3}`]
            )
          : "",
      ]),
      h(
        "div",
        {
          class:
            "flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800",
        },
        [
          h("span", {}, [`⚡ ${pattern.latency}`]),
          h("span", {}, [`💰 ${pattern.tokenCost}`]),
        ]
      ),
    ]
  );

  const open = () => navigateTo({ name: "pattern", slug: pattern.slug });
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}
