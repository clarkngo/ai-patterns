import type { Pattern } from "@/types";
import { reactToolLoop } from "./react-tool-loop";
import { routerWorkerMcp } from "./router-worker-mcp";
import { evaluatorOptimizerLoop } from "./evaluator-optimizer-loop";
import { selfHealingSheetsCrmSync } from "./self-healing-sheets-crm-sync";
import { admissionsReviewSwarm } from "./admissions-review-swarm";
import { financialAidGuardrails } from "./financial-aid-guardrails";
import { academicPetitionApprovalGate } from "./academic-petition-approval-gate";
import { mcpQuickstart } from "./mcp-quickstart";
import { webhookIngestionBasic } from "./webhook-ingestion-basic";
import { sequentialHandoff } from "./sequential-handoff";
import { structuredOutputRetry } from "./structured-output-retry";

export const patterns: Pattern[] = [
  reactToolLoop,
  mcpQuickstart,
  webhookIngestionBasic,
  sequentialHandoff,
  structuredOutputRetry,
  routerWorkerMcp,
  evaluatorOptimizerLoop,
  selfHealingSheetsCrmSync,
  admissionsReviewSwarm,
  financialAidGuardrails,
  academicPetitionApprovalGate,
];

export const patternsBySlug = new Map(patterns.map((p) => [p.slug, p]));
