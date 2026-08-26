import type { Pattern } from "@/types";
import { reactToolLoop } from "./react-tool-loop";
import { routerWorkerMcp } from "./router-worker-mcp";
import { evaluatorOptimizerLoop } from "./evaluator-optimizer-loop";
import { selfHealingSheetsCrmSync } from "./self-healing-sheets-crm-sync";

export const patterns: Pattern[] = [
  reactToolLoop,
  routerWorkerMcp,
  evaluatorOptimizerLoop,
  selfHealingSheetsCrmSync,
];

export const patternsBySlug = new Map(patterns.map((p) => [p.slug, p]));
