import { h, escapeHtml } from "@/lib/dom";
import { attachCopyButton } from "@/lib/clipboard";
import type { CodeBlock } from "@/types";

export function renderCodeBlock(block: CodeBlock): HTMLElement {
  const copyBtn = h(
    "button",
    {
      class:
        "text-xs font-medium px-2 py-1 rounded bg-slate-700/80 text-slate-100 hover:bg-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors",
      type: "button",
    },
    ["Copy"]
  ) as HTMLButtonElement;
  attachCopyButton(copyBtn, () => block.code);

  const header = h(
    "div",
    {
      class:
        "flex items-center justify-between px-3 py-1.5 bg-slate-800 dark:bg-slate-900 rounded-t-md border-b border-slate-700",
    },
    [
      h("span", { class: "text-xs font-mono text-slate-400 uppercase tracking-wide" }, [
        block.language,
      ]),
      copyBtn,
    ]
  );

  const pre = h("pre", {
    class:
      "overflow-x-auto p-4 text-sm leading-relaxed bg-slate-900 dark:bg-slate-950 rounded-b-md font-mono text-slate-100",
  });
  const code = h("code", {});
  code.innerHTML = escapeHtml(block.code);
  pre.append(code);

  return h("div", { class: "rounded-md overflow-hidden shadow-sm mb-4" }, [header, pre]);
}
