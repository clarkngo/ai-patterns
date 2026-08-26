import { h } from "@/lib/dom";
import { navigateTo } from "@/lib/router";
import { renderMermaid } from "@/lib/mermaid";
import { attachCopyButton } from "@/lib/clipboard";
import { createTabs } from "@/components/tabs";
import { renderCodeBlock } from "@/components/codeBlock";
import { complexityColor, categoryColor } from "@/lib/badges";
import type { Pattern } from "@/types";

function metaStat(label: string, value: string): HTMLElement {
  return h("div", { class: "flex flex-col gap-0.5" }, [
    h("span", { class: "text-[11px] uppercase tracking-wide text-slate-400" }, [label]),
    h("span", { class: "text-sm font-medium text-slate-700 dark:text-slate-200" }, [value]),
  ]);
}

function sectionHeading(title: string): HTMLElement {
  return h(
    "h2",
    {
      class:
        "text-xl font-semibold text-slate-900 dark:text-white mt-10 mb-3 scroll-mt-20",
    },
    [title]
  );
}

export function renderPatternDetail(pattern: Pattern): HTMLElement {
  const backLink = h(
    "button",
    {
      type: "button",
      class:
        "text-sm text-slate-500 hover:text-accent-600 dark:hover:text-accent-400 mb-4 inline-flex items-center gap-1",
    },
    ["← Back to catalog"]
  );
  backLink.addEventListener("click", () => navigateTo({ name: "catalog" }));

  const header = h("div", { class: "mb-6" }, [
    h("div", { class: "flex flex-wrap gap-2 mb-3" }, [
      h(
        "span",
        { class: `text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColor[pattern.category]}` },
        [pattern.category]
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
      "h1",
      { class: "text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white" },
      [pattern.name]
    ),
    h("p", { class: "mt-3 text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl" }, [
      pattern.summary,
    ]),
  ]);

  const metaPanel = h(
    "div",
    {
      class:
        "grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 mb-2",
    },
    [
      metaStat("Latency Profile", pattern.latency),
      metaStat("Token Cost", pattern.tokenCost),
      metaStat("Complexity", pattern.complexity),
      metaStat("Frameworks", pattern.frameworks.join(", ")),
    ]
  );

  const intentSection = h("div", {}, [
    sectionHeading("Intent / Problem Statement"),
    h("p", { class: "text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl" }, [
      pattern.intent,
    ]),
  ]);

  // --- Architecture diagram ---
  const diagramContainer = h("div", {
    class:
      "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 overflow-x-auto",
  });
  diagramContainer.innerHTML =
    '<div class="text-sm text-slate-400 py-8 text-center">Rendering diagram…</div>';

  const diagramCopyBtn = h(
    "button",
    {
      type: "button",
      class:
        "text-xs font-medium px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors",
    },
    ["Copy Mermaid source"]
  ) as HTMLButtonElement;
  attachCopyButton(diagramCopyBtn, () => pattern.diagram);

  const diagramSection = h("div", {}, [
    h("div", { class: "flex items-center justify-between mt-10 mb-3" }, [
      h("h2", { class: "text-xl font-semibold text-slate-900 dark:text-white" }, [
        "Architecture Diagram",
      ]),
      diagramCopyBtn,
    ]),
    diagramContainer,
  ]);

  renderMermaid(diagramContainer, pattern.diagram);

  // --- Code tabs ---
  const codeSection = h("div", {}, [
    sectionHeading("State Schema, Execution Loop & Tool Contracts"),
    createTabs(
      pattern.codeBlocks.map((block) => ({
        label: block.label,
        render: () => renderCodeBlock(block),
      })),
      pattern.slug
    ),
  ]);

  // --- Failure modes ---
  const failureSection = h("div", {}, [
    sectionHeading("Failure Modes & Edge Cases"),
    h(
      "div",
      { class: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      pattern.failureModes.map((fm) =>
        h(
          "div",
          {
            class:
              "rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900/40",
          },
          [
            h("h3", { class: "text-sm font-semibold text-rose-600 dark:text-rose-400 mb-1.5" }, [
              fm.title,
            ]),
            h("p", { class: "text-sm text-slate-600 dark:text-slate-400 mb-2" }, [
              fm.description,
            ]),
            h("p", { class: "text-sm text-slate-700 dark:text-slate-300" }, [
              h("span", { class: "font-medium text-emerald-600 dark:text-emerald-400" }, [
                "Mitigation: ",
              ]),
              fm.mitigation,
            ]),
          ]
        )
      )
    ),
  ]);

  // --- Use cases ---
  const useCaseSection = h("div", {}, [
    sectionHeading("Real-World Use Cases"),
    h(
      "div",
      { class: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      pattern.useCases.map((uc) =>
        h(
          "div",
          {
            class:
              "rounded-xl border border-accent-200 dark:border-accent-900/50 p-4 bg-accent-50/50 dark:bg-accent-950/20",
          },
          [
            h("h3", { class: "text-sm font-semibold text-accent-700 dark:text-accent-400 mb-1.5" }, [
              uc.title,
            ]),
            h("p", { class: "text-sm text-slate-600 dark:text-slate-400" }, [uc.description]),
          ]
        )
      )
    ),
  ]);

  const wrapper = h("div", { class: "max-w-4xl pb-20" }, [
    backLink,
    header,
    metaPanel,
    intentSection,
    diagramSection,
    codeSection,
    failureSection,
    useCaseSection,
  ]);

  return wrapper;
}
