import { h } from "@/lib/dom";

export interface TabDef {
  label: string;
  render: () => HTMLElement;
}

export function createTabs(tabs: TabDef[], idPrefix: string): HTMLElement {
  const tabList = h("div", {
    class: "flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800",
    role: "tablist",
  });
  const panelHost = h("div", { class: "pt-4" });

  const buttons: HTMLButtonElement[] = [];

  function activate(index: number): void {
    buttons.forEach((btn, i) => {
      const active = i === index;
      btn.setAttribute("aria-selected", String(active));
      btn.className = tabButtonClass(active);
    });
    panelHost.innerHTML = "";
    panelHost.append(tabs[index].render());
  }

  tabs.forEach((tab, i) => {
    const btn = h(
      "button",
      {
        class: tabButtonClass(i === 0),
        role: "tab",
        type: "button",
        "aria-selected": String(i === 0),
        id: `${idPrefix}-tab-${i}`,
      },
      [tab.label]
    );
    btn.addEventListener("click", () => activate(i));
    buttons.push(btn);
    tabList.append(btn);
  });

  activate(0);

  return h("div", { class: "w-full" }, [tabList, panelHost]);
}

function tabButtonClass(active: boolean): string {
  const base =
    "px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors";
  return active
    ? `${base} border-accent-600 text-accent-700 dark:text-accent-400 dark:border-accent-400`
    : `${base} border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200`;
}
