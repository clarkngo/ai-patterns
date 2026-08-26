import { getTheme } from "@/lib/theme";
import type { Mermaid } from "mermaid";

let mermaidPromise: Promise<Mermaid> | null = null;
let initialized = false;

async function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidPromise;
}

async function ensureInitialized(mermaid: Mermaid): Promise<void> {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: getTheme() === "dark" ? "dark" : "default",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    themeVariables: {
      fontSize: "14px",
    },
  });
  initialized = true;
}

let renderSeq = 0;

export async function renderMermaid(
  container: HTMLElement,
  source: string
): Promise<void> {
  try {
    const mermaid = await loadMermaid();
    await ensureInitialized(mermaid);
    const id = `mermaid-${Date.now()}-${renderSeq++}`;
    const { svg } = await mermaid.render(id, source);
    container.innerHTML = svg;
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-red-500 font-mono p-4 border border-red-300 dark:border-red-700 rounded">Diagram failed to render: ${
      err instanceof Error ? err.message : String(err)
    }</div>`;
  }
}

export function reinitMermaidTheme(): void {
  initialized = false;
}
