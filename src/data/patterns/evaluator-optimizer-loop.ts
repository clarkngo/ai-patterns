import type { Pattern } from "@/types";

export const evaluatorOptimizerLoop: Pattern = {
  slug: "evaluator-optimizer-loop",
  name: "Evaluator-Optimizer Loop",
  category: "Orchestration & Control Loops",
  complexity: "Intermediate",
  latency: "Medium (2-10s)",
  tokenCost: "High",
  frameworks: ["LangGraph", "AutoGen", "Raw Python"],
  tags: ["evaluator", "self-critique", "quality-gate", "loop", "refinement"],
  summary:
    "A generator agent produces a candidate output; a separate evaluator agent scores it against explicit criteria and returns structured feedback; the generator revises until the evaluator passes it or a retry budget is exhausted.",
  intent:
    "Single-pass generation is brittle for tasks with objective quality bars — code that must compile, copy that must pass a style guide, structured data that must satisfy a schema plus business rules an LLM can check but a JSON schema can't express. Rather than trusting the generator's own confidence, this pattern separates generation from judgment: an independent evaluator (ideally a different prompt, sometimes a different model) scores the artifact against explicit, versioned criteria and returns actionable feedback rather than a bare pass/fail, so the generator's next attempt is a targeted revision instead of a blind retry.",
  diagram: `sequenceDiagram
    autonumber
    participant O as Orchestrator
    participant G as Generator Agent
    participant E as Evaluator Agent
    participant S as Rubric Store

    O->>S: Load scoring rubric for task_type
    O->>G: Generate(task, constraints)
    G-->>O: candidate_v1

    loop until PASS or attempts >= max_attempts
        O->>E: Evaluate(candidate, rubric)
        E-->>O: { verdict, score, findings[] }
        alt verdict == PASS
            O-->>O: exit loop
        else verdict == FAIL
            O->>G: Revise(candidate, findings)
            G-->>O: candidate_vN+1
        end
    end

    alt attempts exhausted without PASS
        O->>O: emit best-scoring candidate + escalation flag
    end
    O-->>O: Return final candidate + audit trail`,
  codeBlocks: [
    {
      label: "State Schema (Pydantic)",
      language: "python",
      code: `from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Verdict(str, Enum):
    PASS = "pass"
    FAIL = "fail"


class Finding(BaseModel):
    criterion: str
    passed: bool
    severity: str = Field(pattern="^(blocker|major|minor)$")
    explanation: str
    suggested_fix: Optional[str] = None


class EvaluationResult(BaseModel):
    verdict: Verdict
    score: float = Field(ge=0.0, le=1.0)
    findings: list[Finding]
    rubric_version: str


class Attempt(BaseModel):
    version: int
    candidate: str
    evaluation: Optional[EvaluationResult] = None


class OptimizerState(BaseModel):
    task: str
    rubric_id: str
    attempts: list[Attempt] = []
    max_attempts: int = 4
    status: str = "running"  # running | passed | escalated
    best_attempt_index: Optional[int] = None`,
    },
    {
      label: "Execution Loop",
      language: "python",
      code: `async def run_evaluator_optimizer(
    task: str,
    rubric_id: str,
    generator: ChatModel,
    evaluator: ChatModel,
    rubric_store: RubricStore,
    max_attempts: int = 4,
) -> OptimizerState:
    state = OptimizerState(task=task, rubric_id=rubric_id, max_attempts=max_attempts)
    rubric = await rubric_store.load(rubric_id)

    candidate = await generate(generator, task, constraints=rubric.constraints)
    state.attempts.append(Attempt(version=1, candidate=candidate))

    while len(state.attempts) <= state.max_attempts:
        current = state.attempts[-1]
        evaluation = await evaluate(evaluator, current.candidate, rubric)
        current.evaluation = evaluation

        if evaluation.verdict == Verdict.PASS:
            state.status = "passed"
            state.best_attempt_index = len(state.attempts) - 1
            return state

        if len(state.attempts) >= state.max_attempts:
            break

        # Revision is targeted: only blocker/major findings are passed back,
        # so the generator doesn't thrash on stylistic nitpicks near the budget edge.
        actionable = [f for f in evaluation.findings if f.severity in ("blocker", "major")]
        revised = await generate(
            generator,
            task,
            constraints=rubric.constraints,
            prior_candidate=current.candidate,
            feedback=actionable,
        )
        state.attempts.append(Attempt(version=current.version + 1, candidate=revised))

    # Exhausted attempts without a PASS — surface the highest-scoring
    # attempt and flag for human review rather than silently returning a failure.
    state.status = "escalated"
    state.best_attempt_index = max(
        range(len(state.attempts)),
        key=lambda i: state.attempts[i].evaluation.score
        if state.attempts[i].evaluation
        else 0.0,
    )
    return state


async def evaluate(
    evaluator: ChatModel, candidate: str, rubric: Rubric
) -> EvaluationResult:
    response = await evaluator.chat(
        messages=[
            {"role": "system", "content": rubric.evaluator_system_prompt},
            {"role": "user", "content": f"CANDIDATE:\\n{candidate}"},
        ],
        response_format={"type": "json_schema", "schema": EvaluationResult.model_json_schema()},
        temperature=0.0,  # deterministic scoring
    )
    return EvaluationResult.model_validate_json(response.content)`,
    },
  ],
  failureModes: [
    {
      title: "Evaluator and generator collude on a shared blind spot",
      description:
        "When the same model plays both roles, systematic errors (a misunderstood requirement, a subtly wrong API signature) pass evaluation because the evaluator shares the generator's mistaken assumption.",
      mitigation:
        "Use a different model or a materially different prompt (different framing, explicit adversarial instructions) for the evaluator, and where possible ground evaluation in executable checks (compile/run/lint) rather than pure LLM judgment.",
    },
    {
      title: "Oscillation between two failing states",
      description:
        "Fixing finding A reintroduces finding B from two attempts ago because the generator only sees the latest feedback, not the full revision history.",
      mitigation:
        "Include a compact diff-style history of prior findings in the revision prompt, and detect oscillation by hashing candidates — if a candidate repeats, break the loop and escalate immediately rather than burning the remaining budget.",
    },
    {
      title: "Rubric drift breaks reproducibility",
      description:
        "Someone edits the rubric prompt in place; historical audit logs no longer reflect what a stored PASS verdict actually checked.",
      mitigation:
        "Version rubrics explicitly (rubric_id + rubric_version) and persist the resolved rubric text alongside every EvaluationResult so past verdicts remain interpretable after the rubric changes.",
    },
  ],
  useCases: [
    {
      title: "Autonomous PR description / changelog generation",
      description:
        "Generator drafts a PR summary; evaluator checks it against a rubric (mentions breaking changes, links relevant issues, correct tense) before the summary is auto-posted.",
    },
    {
      title: "Structured lead-qualification memo",
      description:
        "Generator writes a sales qualification memo from CRM data; evaluator verifies every claim traces back to a field in the source record before the memo is attached to the deal.",
    },
  ],
};
