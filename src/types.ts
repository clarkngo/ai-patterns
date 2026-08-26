export type PatternCategory =
  | "Orchestration & Control Loops"
  | "Tooling & MCP Protocols"
  | "External Connectors & State Sync"
  | "Multi-Agent Collaboration"
  | "Resilience & Governance";

export type Complexity = "Beginner" | "Intermediate" | "Production-Grade";

export type LatencyProfile = "Low (<2s)" | "Medium (2-10s)" | "High (10s+, async)";

export type TokenCostProfile = "Low" | "Moderate" | "High" | "Variable (tool-bound)";

export type Framework =
  | "LangGraph"
  | "AutoGen"
  | "CrewAI"
  | "Raw TypeScript"
  | "Raw Python"
  | "MCP Server"
  | "LlamaIndex";

export interface CodeBlock {
  /** Tab label, e.g. "State Schema", "Execution Loop" */
  label: string;
  /** Language for syntax highlighting hints, e.g. "typescript", "python" */
  language: string;
  code: string;
}

export interface FailureMode {
  title: string;
  description: string;
  mitigation: string;
}

export interface UseCase {
  title: string;
  description: string;
}

export interface Pattern {
  slug: string;
  name: string;
  category: PatternCategory;
  complexity: Complexity;
  latency: LatencyProfile;
  tokenCost: TokenCostProfile;
  frameworks: Framework[];
  tags: string[];
  summary: string;
  intent: string;
  diagram: string; // mermaid source
  codeBlocks: CodeBlock[];
  failureModes: FailureMode[];
  useCases: UseCase[];
}
