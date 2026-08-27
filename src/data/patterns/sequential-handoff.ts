import type { Pattern } from "@/types";

export const sequentialHandoff: Pattern = {
  slug: "sequential-handoff",
  name: "Sequential Handoff (Baton Pass)",
  category: "Multi-Agent Collaboration",
  complexity: "Beginner",
  latency: "Medium (2-10s)",
  tokenCost: "Low",
  frameworks: ["Raw TypeScript", "Raw Python", "CrewAI", "LangGraph"],
  tags: ["multi-agent", "beginner", "getting-started", "handoff", "pipeline"],
  summary:
    "The simplest possible multi-agent setup: Agent A finishes its subtask and passes a structured context object to Agent B, who continues. No supervisor, no parallelism, no voting — just a linear chain, like a relay race.",
  intent:
    "'Multi-agent' often sounds like it requires a supervisor, a message bus, or a swarm — but the first multi-agent system most people should actually build is much simpler: split a task into stages, give each stage its own focused agent and prompt, and pass a well-defined object from one to the next. This is worth doing even before you need true parallelism or debate, because it forces you to define the interface between stages explicitly (what exactly does the research agent hand the writing agent?) — and that discipline is what the more elaborate collaboration patterns in this catalog build on. If you're not sure whether your problem needs a supervisor-worker swarm or a debate architecture, start here and only add complexity once a straight line actually stops being enough.",
  diagram: `sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent A: Researcher
    participant B as Agent B: Writer
    participant C as Agent C: Editor

    U->>A: Task: "Write a product update email about feature X"
    A->>A: Gather facts (search docs, changelog)
    A-->>B: Handoff: { facts[], sources[] }

    B->>B: Draft email using only the handed-off facts
    B-->>C: Handoff: { draft, facts_used[] }

    C->>C: Check draft against facts, tone, length
    alt Draft passes checks
        C-->>U: Final email
    else Draft needs rework
        C-->>B: Handoff back: { draft, issues[] }
        B->>B: Revise
        B-->>C: Handoff: { revised_draft }
        C-->>U: Final email
    end
    Note over A,C: Each agent only ever sees the handoff object,<br/>never the other agents' internal reasoning.`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `// The handoff object is the entire contract between stages —
// design it deliberately, the way you'd design a function signature.
interface ResearchHandoff {
  facts: string[];
  sources: string[];
}

interface DraftHandoff {
  draft: string;
  factsUsed: string[];
}

interface EditReworkHandoff {
  draft: string;
  issues: string[];
}

interface PipelineState {
  task: string;
  stage: "researching" | "drafting" | "editing" | "reworking" | "done";
  research?: ResearchHandoff;
  draft?: DraftHandoff;
  finalOutput?: string;
  reworkCount: number;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function runSequentialPipeline(
  task: string,
  researcher: ChatModel,
  writer: ChatModel,
  editor: ChatModel,
  maxReworks = 2
): Promise<PipelineState> {
  const state: PipelineState = { task, stage: "researching", reworkCount: 0 };

  // Stage 1: Research. This agent's only job is to gather facts —
  // it never sees the writing or editing prompts.
  const researchResponse = await researcher.chat({
    messages: [
      { role: "system", content: RESEARCHER_SYSTEM_PROMPT },
      { role: "user", content: task },
    ],
    responseFormat: { type: "json_schema", schema: ResearchHandoffSchema },
  });
  state.research = JSON.parse(researchResponse.content!);
  state.stage = "drafting";

  // Stage 2: Draft. The writer only sees the task and the research
  // handoff — not how the research was gathered.
  let draftResponse = await writer.chat({
    messages: [
      { role: "system", content: WRITER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ task, research: state.research }) },
    ],
    responseFormat: { type: "json_schema", schema: DraftHandoffSchema },
  });
  state.draft = JSON.parse(draftResponse.content!);
  state.stage = "editing";

  // Stage 3: Edit, with a small bounded rework loop back to the writer.
  while (state.reworkCount <= maxReworks) {
    const editResponse = await editor.chat({
      messages: [
        { role: "system", content: EDITOR_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ draft: state.draft, facts: state.research!.facts }) },
      ],
      responseFormat: { type: "json_schema", schema: EditVerdictSchema },
    });
    const verdict = JSON.parse(editResponse.content!);

    if (verdict.approved) {
      state.finalOutput = state.draft!.draft;
      state.stage = "done";
      return state;
    }

    if (state.reworkCount === maxReworks) break; // budget exhausted, ship best draft

    state.stage = "reworking";
    state.reworkCount++;
    draftResponse = await writer.chat({
      messages: [
        { role: "system", content: WRITER_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ draft: state.draft!.draft, issues: verdict.issues } satisfies EditReworkHandoff),
        },
      ],
      responseFormat: { type: "json_schema", schema: DraftHandoffSchema },
    });
    state.draft = JSON.parse(draftResponse.content!);
  }

  // Rework budget exhausted without approval — ship the last draft
  // rather than loop forever, and let the caller know it wasn't approved.
  state.finalOutput = state.draft!.draft;
  state.stage = "done";
  return state;
}`,
    },
  ],
  failureModes: [
    {
      title: "Handoff object silently drops information the next stage needed",
      description:
        "The research agent gathers useful nuance (e.g. a caveat about a feature's availability) but the handoff schema only has a flat facts: string[] field, so the writer never sees the caveat and the final email states something inaccurately.",
      mitigation:
        "Treat the handoff schema as a real interface design problem — review it whenever the next stage's output is subtly wrong, and add fields deliberately rather than stuffing more into a free-text summary field.",
    },
    {
      title: "Rework loop between writer and editor never converges",
      description:
        "The editor's feedback is vague enough ('make it punchier') that the writer's revision doesn't clearly address it, and the pair could cycle indefinitely without a hard cap.",
      mitigation:
        "Always cap the rework loop (maxReworks above) and require the editor to give specific, checkable issues rather than subjective style feedback — and ship the best-effort draft when the budget runs out instead of blocking indefinitely.",
    },
    {
      title: "Later stage re-does work the earlier stage already did",
      description:
        "Without a clear contract, the writer might re-research facts on its own instead of trusting the handoff, doubling token cost and risking inconsistency between what was researched and what was written.",
      mitigation:
        "Explicitly instruct each stage's system prompt to work only from its handoff input and not re-derive information from scratch — and don't give the writer or editor tools that would let them do the researcher's job.",
    },
  ],
  useCases: [
    {
      title: "Research-draft-edit content pipeline",
      description:
        "Marketing or support teams generate first-draft content (release notes, FAQ answers) where each stage's job is genuinely separable — gathering facts, writing prose, and checking accuracy are different skills.",
    },
    {
      title: "Intake-triage-response customer service flow",
      description:
        "A first agent classifies and extracts key details from an incoming request, a second agent drafts a response using only those extracted details, keeping each stage's prompt simple and easy to debug independently.",
    },
  ],
};
