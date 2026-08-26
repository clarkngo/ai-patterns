import type { Complexity, PatternCategory } from "@/types";

export const complexityColor: Record<Complexity, string> = {
  Beginner:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Intermediate:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Production-Grade":
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export const categoryColor: Record<PatternCategory, string> = {
  "Orchestration & Control Loops":
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "Tooling & MCP Protocols":
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "External Connectors & State Sync":
    "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "Multi-Agent Collaboration":
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "Resilience & Governance":
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

export const categoryAbbreviation: Record<PatternCategory, string> = {
  "Orchestration & Control Loops": "Orchestration",
  "Tooling & MCP Protocols": "MCP Tooling",
  "External Connectors & State Sync": "Connectors",
  "Multi-Agent Collaboration": "Multi-Agent",
  "Resilience & Governance": "Resilience",
};
