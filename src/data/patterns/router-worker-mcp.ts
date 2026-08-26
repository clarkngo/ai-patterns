import type { Pattern } from "@/types";

export const routerWorkerMcp: Pattern = {
  slug: "router-worker-mcp",
  name: "Router-Worker with MCP Tooling",
  category: "Tooling & MCP Protocols",
  complexity: "Intermediate",
  latency: "Medium (2-10s)",
  tokenCost: "Moderate",
  frameworks: ["MCP Server", "LangGraph", "Raw TypeScript"],
  tags: ["mcp", "router", "worker", "tool-discovery", "hierarchy"],
  summary:
    "A lightweight router agent classifies incoming requests and dispatches to specialized worker agents, each backed by its own set of Model Context Protocol servers discovered dynamically at runtime.",
  intent:
    "As the number of integrations grows (CRM, ticketing, search, code execution), stuffing every tool schema into a single agent's context degrades routing accuracy and inflates token cost. This pattern solves that by separating concerns: a cheap, fast router model classifies intent and picks a worker; each worker only ever sees the MCP tool schemas relevant to its domain, discovered dynamically from its assigned MCP server(s) rather than hardcoded. This keeps per-call context small, lets you scale tool coverage by adding MCP servers instead of editing prompts, and isolates blast radius — a misbehaving worker can't invoke tools outside its domain.",
  diagram: `flowchart TB
    U[User Request] --> R{Router Agent}
    R -->|intent: crm| W1[CRM Worker]
    R -->|intent: docs| W2[Docs Worker]
    R -->|intent: code| W3[Sandbox Worker]
    R -->|intent: unknown| F[Fallback / Clarify]

    subgraph MCP1[MCP Server: CRM]
      T1[tool: search_contacts]
      T2[tool: update_deal]
    end
    subgraph MCP2[MCP Server: Docs]
      T3[tool: vector_search]
      T4[tool: fetch_page]
    end
    subgraph MCP3[MCP Server: Sandbox]
      T5[tool: run_python]
    end

    W1 -->|list_tools / call_tool| MCP1
    W2 -->|list_tools / call_tool| MCP2
    W3 -->|list_tools / call_tool| MCP3

    W1 --> Agg[Response Aggregator]
    W2 --> Agg
    W3 --> Agg
    Agg --> U`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `type WorkerDomain = "crm" | "docs" | "code" | "unknown";

interface RouteDecision {
  domain: WorkerDomain;
  confidence: number; // 0-1
  rationale: string;
}

interface McpServerBinding {
  serverId: string;
  transport: "stdio" | "sse" | "http";
  endpoint: string;
  // Cached at session start; refreshed on a TTL or on tool-not-found errors.
  toolCache?: { fetchedAt: number; tools: McpToolSchema[] };
}

interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

interface WorkerConfig {
  domain: WorkerDomain;
  systemPrompt: string;
  mcpServers: McpServerBinding[];
  maxSteps: number;
}

interface RouterState {
  requestId: string;
  userInput: string;
  route?: RouteDecision;
  workerTranscript: TranscriptEntry[];
  finalResponse?: string;
  escalatedToHuman: boolean;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function routeAndDispatch(
  userInput: string,
  router: ChatModel,
  workers: Record<WorkerDomain, WorkerConfig>,
  mcpClient: McpClient
): Promise<RouterState> {
  const state: RouterState = {
    requestId: crypto.randomUUID(),
    userInput,
    workerTranscript: [],
    escalatedToHuman: false,
  };

  // 1. Classify — cheap, low-latency model call, no tools attached.
  const routeRaw = await router.chat({
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: userInput },
    ],
    responseFormat: { type: "json_schema", schema: RouteDecisionSchema },
  });
  state.route = JSON.parse(routeRaw.content!) as RouteDecision;

  if (state.route.domain === "unknown" || state.route.confidence < 0.55) {
    state.escalatedToHuman = true;
    state.finalResponse =
      "I'm not confident I can route this automatically — flagging for a human.";
    return state;
  }

  // 2. Dynamic tool discovery — fetch (or reuse cached) tool schemas
  //    from the MCP server(s) bound to this worker's domain.
  const worker = workers[state.route.domain];
  const toolSchemas = await Promise.all(
    worker.mcpServers.map((binding) => discoverTools(binding, mcpClient))
  ).then((lists) => lists.flat());

  // 3. Run the worker's own bounded ReAct-style loop, scoped to its tools.
  const workerModel = router; // could be a different, larger model per domain
  const result = await runReActLoop(
    userInput,
    new ToolRegistry(toolSchemas, (call) =>
      mcpClient.callTool(resolveServerFor(call.name, worker), call)
    ),
    workerModel,
    worker.maxSteps
  );

  state.workerTranscript = result.transcript;
  state.finalResponse = result.finalAnswer ?? "Worker exhausted its step budget.";
  return state;
}

async function discoverTools(
  binding: McpServerBinding,
  client: McpClient,
  ttlMs = 5 * 60_000
): Promise<McpToolSchema[]> {
  const fresh =
    binding.toolCache && Date.now() - binding.toolCache.fetchedAt < ttlMs;
  if (fresh) return binding.toolCache!.tools;

  const tools = await client.listTools(binding);
  binding.toolCache = { fetchedAt: Date.now(), tools };
  return tools;
}`,
    },
    {
      label: "MCP Client Contract",
      language: "typescript",
      code: `// Minimal MCP client surface this pattern depends on.
// Backed by @modelcontextprotocol/sdk in production.
interface McpClient {
  listTools(binding: McpServerBinding): Promise<McpToolSchema[]>;
  callTool(
    binding: McpServerBinding,
    call: { name: string; arguments: Record<string, unknown> }
  ): Promise<{ content: unknown; isError: boolean }>;
}

// Example MCP server manifest (served at /mcp/manifest.json by a CRM MCP server)
const crmMcpManifest = {
  name: "crm-mcp-server",
  version: "1.2.0",
  capabilities: { tools: { listChanged: true } },
  tools: [
    {
      name: "search_contacts",
      description: "Search CRM contacts by name, email, or company domain.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "update_deal",
      description: "Update stage or amount on an existing deal.",
      inputSchema: {
        type: "object",
        properties: {
          dealId: { type: "string" },
          stage: { type: "string" },
          amount: { type: "number" },
        },
        required: ["dealId"],
      },
    },
  ],
};`,
    },
  ],
  failureModes: [
    {
      title: "Router misclassification cascades",
      description:
        "A low-confidence but above-threshold route sends a docs question to the CRM worker, which then either hallucinates a tool call or burns its full step budget failing to find relevant tools.",
      mitigation:
        "Set the confidence threshold conservatively and give every worker a no_match escape-hatch tool that routes back to the router with a reason, rather than letting the worker force an answer with the wrong toolset.",
    },
    {
      title: "Stale tool cache after MCP server redeploy",
      description:
        "An MCP server adds or renames a tool; the worker keeps calling the old tool name using a cached schema and gets UNKNOWN_TOOL errors.",
      mitigation:
        "Treat a tool-not-found response as a cache invalidation signal — force a listTools refresh and retry once before surfacing the error to the model.",
    },
    {
      title: "Cross-domain tool leakage",
      description:
        "A worker's system prompt is generic enough that the model tries to call a tool name it has seen in training data but that isn't actually bound to this worker's MCP servers.",
      mitigation:
        "Only pass the dynamically discovered tool schemas for the worker's bound servers into the model call — never a static, pre-baked list — so calling an unbound tool is a schema validation error the model can observe and correct.",
    },
  ],
  useCases: [
    {
      title: "Unified support copilot across CRM, docs, and code sandbox",
      description:
        "A single chat surface routes billing questions to a CRM-backed worker, product questions to a docs-search worker, and bug repro requests to a sandboxed code-execution worker — each isolated behind its own MCP server.",
    },
    {
      title: "Internal ops assistant with per-team tool scoping",
      description:
        "Finance, Sales, and Support each run their own MCP server exposing only their team's approved tools; the router ensures a Sales question never accidentally gets Finance-only write access.",
    },
  ],
};
