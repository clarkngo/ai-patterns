import type { Pattern } from "@/types";

export const reactToolLoop: Pattern = {
  slug: "react-tool-loop",
  name: "ReAct Tool-Calling Loop",
  category: "Orchestration & Control Loops",
  complexity: "Beginner",
  latency: "Low (<2s)",
  tokenCost: "Low",
  frameworks: ["Raw TypeScript", "Raw Python", "LangGraph"],
  tags: ["react", "tool-calling", "loop", "foundational", "single-agent"],
  summary:
    "The foundational reason-act-observe loop: a single agent alternates between reasoning, calling a tool, and observing the result until it emits a final answer.",
  intent:
    "Most autonomous agent behavior reduces to one primitive: let the model think, let it call a tool, feed the result back, repeat. Without a bounded, well-instrumented version of this loop, agents either stop too early (never using a tool that would fix a wrong answer) or run forever (looping on a tool that keeps failing). This pattern establishes the minimal, production-safe skeleton — step budget, structured stop conditions, and observation formatting — that every more complex pattern in this catalog builds on top of.",
  diagram: `sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent (LLM)
    participant T as Tool Executor
    participant Env as External System

    U->>A: Task + system prompt + tool schemas
    loop until final_answer or step_budget exhausted
        A->>A: Reason over transcript so far
        alt Model requests a tool call
            A->>T: tool_name(args)
            T->>Env: Execute (API call, code exec, query)
            Env-->>T: Result or error
            T-->>A: Observation (structured JSON)
            Note over A: Observation appended to transcript
        else Model emits final answer
            A-->>U: Final answer
        end
    end
    Note over A,T: If step_budget exhausted with no final answer,<br/>loop exits with a "best-effort" partial result flag.`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface Observation {
  toolCallId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

type TranscriptEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; observation: Observation };

interface AgentLoopState {
  transcript: TranscriptEntry[];
  stepCount: number;
  stepBudget: number;
  status: "running" | "final_answer" | "budget_exhausted" | "error";
  finalAnswer?: string;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function runReActLoop(
  task: string,
  tools: ToolRegistry,
  model: ChatModel,
  stepBudget = 8
): Promise<AgentLoopState> {
  const state: AgentLoopState = {
    transcript: [{ role: "user", content: task }],
    stepCount: 0,
    stepBudget,
    status: "running",
  };

  while (state.status === "running" && state.stepCount < state.stepBudget) {
    state.stepCount++;

    const response = await model.chat({
      messages: state.transcript,
      tools: tools.schemas(),
    });

    if (response.toolCalls?.length) {
      state.transcript.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Execute tool calls in parallel; each is isolated so one
      // failure doesn't block sibling calls in the same turn.
      const observations = await Promise.all(
        response.toolCalls.map((call) => executeTool(call, tools))
      );
      for (const obs of observations) {
        state.transcript.push({ role: "tool", observation: obs });
      }
      continue;
    }

    // No tool call => model believes it has a final answer.
    state.transcript.push({ role: "assistant", content: response.content });
    state.status = "final_answer";
    state.finalAnswer = response.content ?? "";
  }

  if (state.status === "running") {
    state.status = "budget_exhausted";
  }
  return state;
}

async function executeTool(
  call: ToolCall,
  tools: ToolRegistry
): Promise<Observation> {
  try {
    const tool = tools.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        ok: false,
        error: { code: "UNKNOWN_TOOL", message: \`No tool named \${call.name}\` },
      };
    }
    const parsed = tool.schema.safeParse(call.arguments);
    if (!parsed.success) {
      return {
        toolCallId: call.id,
        ok: false,
        error: { code: "INVALID_ARGS", message: parsed.error.message },
      };
    }
    const result = await withTimeout(tool.run(parsed.data), 10_000);
    return { toolCallId: call.id, ok: true, result };
  } catch (err) {
    return {
      toolCallId: call.id,
      ok: false,
      error: { code: "TOOL_EXCEPTION", message: String(err) },
    };
  }
}`,
    },
  ],
  failureModes: [
    {
      title: "Infinite tool-call ping-pong",
      description:
        "The model calls the same tool repeatedly with near-identical arguments, never converging on a final answer (common when a tool returns an ambiguous or empty result).",
      mitigation:
        "Enforce a hard stepBudget and track a rolling hash of (tool name, arguments) pairs; if the same call repeats 2x in a row, inject a system observation forcing the model to either change strategy or answer with its best guess.",
    },
    {
      title: "Hallucinated tool arguments",
      description:
        "The model invents a plausible-looking argument (e.g. a customer ID that doesn't exist) because it never observed the value earlier in the transcript.",
      mitigation:
        "Validate every tool call against a strict schema (zod/pydantic) before execution, and return validation errors as observations rather than throwing — this keeps the failure inside the loop where the model can self-correct.",
    },
    {
      title: "Tool timeout stalls the whole loop",
      description:
        "A downstream API hangs, and the agent process blocks indefinitely waiting for a single tool call.",
      mitigation:
        "Wrap every tool execution in a timeout (withTimeout) and surface the timeout as a structured error observation rather than letting the promise hang — the model can then decide to retry, use a fallback tool, or give up gracefully.",
    },
  ],
  useCases: [
    {
      title: "Customer support triage assistant",
      description:
        "Looks up an order status tool, checks a refund-policy tool, and drafts a reply — all within a single bounded loop before handing off to a human agent.",
    },
    {
      title: "Internal documentation Q&A bot",
      description:
        "Alternates between a vector-search tool and a final-answer synthesis step, re-querying with refined terms when the first search returns low-relevance results.",
    },
  ],
};
