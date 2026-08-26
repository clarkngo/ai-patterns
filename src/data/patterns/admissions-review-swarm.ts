import type { Pattern } from "@/types";

export const admissionsReviewSwarm: Pattern = {
  slug: "admissions-review-swarm",
  name: "Supervisor-Worker Admissions Review Swarm",
  category: "Multi-Agent Collaboration",
  complexity: "Production-Grade",
  latency: "High (10s+, async)",
  tokenCost: "High",
  frameworks: ["LangGraph", "AutoGen", "Raw Python"],
  tags: ["higher-education", "admissions", "supervisor-worker", "swarm", "holistic-review"],
  summary:
    "A supervisor agent decomposes a single applicant file into specialist review tasks — academic record, essays, recommendation letters, financial-need signal — runs the workers in parallel, and synthesizes their structured assessments into a holistic recommendation for a human admissions committee.",
  intent:
    "Holistic admissions review means weighing transcripts, standardized tests (where used), essays, recommendation letters, and extracurricular context together — but stuffing an entire applicant file into one long-context call produces shallow, unevenly-weighted judgments, and a single evaluator prompt asked to do everything tends to over-index on whichever section it read most recently. This pattern splits the file across specialist worker agents, each with a narrow rubric and no visibility into the others' conclusions (to reduce anchoring), then has a supervisor agent synthesize the independent assessments into one structured brief. The pattern never lets an agent emit an accept/deny decision — the synthesized brief is always routed to a human admissions committee, because admissions decisions carry legal and reputational weight that belongs with accountable humans, not a model.",
  diagram: `flowchart TB
    A[Applicant File] --> S{Supervisor Agent}
    S -->|academic record + course rigor| W1[Academic Record Worker]
    S -->|essays + personal statement| W2[Essay & Voice Worker]
    S -->|recommendation letters| W3[Recommendation Worker]
    S -->|need-based aid signal, no decision authority| W4[Financial Context Worker]

    W1 --> R1[(Structured Assessment:<br/>rigor_score, trend, red_flags)]
    W2 --> R2[(Structured Assessment:<br/>voice_score, authenticity_signal)]
    W3 --> R3[(Structured Assessment:<br/>corroboration_score, notable_quotes)]
    W4 --> R4[(Structured Assessment:<br/>need_tier, no accept/deny signal)]

    R1 --> Syn[Supervisor Synthesis]
    R2 --> Syn
    R3 --> Syn
    R4 --> Syn

    Syn -->|holistic brief, no decision| HC[Human Admissions Committee]
    HC -->|accept / deny / waitlist| Reg[Registrar System]

    Syn -.->|score variance too high across workers| Escalate[Flag for Senior Reader]
    Escalate --> HC`,
  codeBlocks: [
    {
      label: "State Schema (Pydantic)",
      language: "python",
      code: `from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RedFlag(BaseModel):
    category: str  # e.g. "grade_trend", "inconsistency", "plagiarism_signal"
    description: str
    confidence: float = Field(ge=0.0, le=1.0)


class AcademicRecordAssessment(BaseModel):
    rigor_score: float = Field(ge=0.0, le=1.0)
    grade_trend: str  # "upward" | "stable" | "downward"
    red_flags: list[RedFlag] = []


class EssayAssessment(BaseModel):
    voice_score: float = Field(ge=0.0, le=1.0)
    authenticity_signal: float = Field(ge=0.0, le=1.0)
    themes: list[str]


class RecommendationAssessment(BaseModel):
    corroboration_score: float = Field(ge=0.0, le=1.0)
    notable_quotes: list[str]
    specificity_flag: bool  # False if letters read as generic/templated


class FinancialContextAssessment(BaseModel):
    need_tier: str  # "high" | "moderate" | "low" | "unknown"
    # Explicitly never includes an accept/deny recommendation —
    # need-blind institutions must be able to strip this worker entirely.


class WorkerAssessments(BaseModel):
    academic: AcademicRecordAssessment
    essay: EssayAssessment
    recommendations: RecommendationAssessment
    financial_context: Optional[FinancialContextAssessment] = None


class SynthesisStatus(str, Enum):
    READY_FOR_COMMITTEE = "ready_for_committee"
    NEEDS_SENIOR_READER = "needs_senior_reader"


class SupervisorSynthesis(BaseModel):
    applicant_id: str
    assessments: WorkerAssessments
    holistic_summary: str
    score_variance: float  # spread across worker scores; high = inconsistent signal
    status: SynthesisStatus
    audit_trail_id: str`,
    },
    {
      label: "Execution Loop",
      language: "python",
      code: `import asyncio
import statistics


async def review_applicant(
    applicant_id: str,
    file: ApplicantFile,
    supervisor: ChatModel,
    workers: WorkerPool,
    audit_log: AuditLog,
    variance_threshold: float = 0.35,
    need_blind: bool = False,
) -> SupervisorSynthesis:
    audit_id = await audit_log.open(applicant_id, stage="admissions_review")

    # Workers run in parallel and never see each other's output —
    # this is the anchoring-reduction property the pattern depends on.
    tasks = [
        workers.academic.assess(file.transcript, file.course_catalog_context),
        workers.essay.assess(file.essays),
        workers.recommendations.assess(file.recommendation_letters),
    ]
    if not need_blind:
        tasks.append(workers.financial_context.assess(file.financial_aid_form))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    academic, essay, recs, *rest = results
    financial = rest[0] if rest and not isinstance(rest[0], Exception) else None

    for r in (academic, essay, recs):
        if isinstance(r, Exception):
            await audit_log.record_error(audit_id, str(r))
            raise WorkerFailureError(f"Required worker failed: {r}")

    assessments = WorkerAssessments(
        academic=academic, essay=essay, recommendations=recs,
        financial_context=financial,
    )

    scores = [academic.rigor_score, essay.voice_score, recs.corroboration_score]
    variance = statistics.pstdev(scores)

    synthesis_prompt = build_synthesis_prompt(file, assessments)
    response = await supervisor.chat(
        messages=[{"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
                  {"role": "user", "content": synthesis_prompt}],
        response_format={"type": "json_schema", "schema": {"holistic_summary": "string"}},
        temperature=0.2,
    )
    holistic_summary = response.content

    status = (
        SynthesisStatus.NEEDS_SENIOR_READER
        if variance > variance_threshold
        else SynthesisStatus.READY_FOR_COMMITTEE
    )

    synthesis = SupervisorSynthesis(
        applicant_id=applicant_id,
        assessments=assessments,
        holistic_summary=holistic_summary,
        score_variance=variance,
        status=status,
        audit_trail_id=audit_id,
    )
    await audit_log.record_synthesis(audit_id, synthesis)
    # Note: no code path in this function ever writes an accept/deny/waitlist
    # value anywhere — that field does not exist until a human enters it.
    return synthesis`,
    },
  ],
  failureModes: [
    {
      title: "Worker score inflation drifts across an admissions cycle",
      description:
        "As the essay worker processes thousands of applications, subtle prompt or model drift causes voice_score to trend upward across the cycle independent of actual essay quality, disadvantaging early applicants relative to later ones.",
      mitigation:
        "Seed every batch with a fixed set of calibration essays with known human-rated scores, and recompute worker score distributions daily against that calibration set — alert if the mean drifts beyond a set tolerance, and freeze the worker for re-prompting rather than let a whole cycle drift.",
    },
    {
      title: "Bias correlated across workers because they share a base model",
      description:
        "Using the same underlying model for all four workers means a shared blind spot (e.g. systematically underrating essays that discuss unconventional career paths) shows up in multiple 'independent' signals at once, making the synthesis look more corroborated than it is.",
      mitigation:
        "Track per-worker score correlations against demographic and background variables the institution is legally permitted to audit for, on a recurring basis with your general counsel and institutional research office involved — statistical correlation, not model choice alone, is what catches this.",
    },
    {
      title: "PII leakage across worker boundaries via shared context",
      description:
        "A shared tool or logging layer accidentally includes one worker's output (e.g. the financial context worker's need-tier) in the prompt context passed to the essay worker, reintroducing exactly the bias the worker isolation was designed to prevent.",
      mitigation:
        "Give each worker call its own isolated context construction path with an explicit allowlist of fields from the applicant file — never pass the full file object or prior worker outputs into a worker's prompt-building function, even by accident of a shared helper.",
    },
    {
      title: "Recommendation worker over-trusts templated letters",
      description:
        "Many recommendation letters follow institutional templates; the worker can mistake generic superlative language for genuine corroboration, inflating corroboration_score for well-coached applicants over those with sincere but plainly-written letters.",
      mitigation:
        "Explicitly instruct the worker to flag specificity_flag=False for letters lacking concrete, checkable anecdotes, and have the supervisor treat low-specificity high-score letters as a red flag for senior reader escalation rather than a straightforward positive signal.",
    },
  ],
  useCases: [
    {
      title: "First-year undergraduate holistic admissions triage",
      description:
        "During peak season, thousands of applications get pre-synthesized into structured briefs so a smaller pool of trained admissions readers spends its time on judgment and context, not manual file assembly.",
    },
    {
      title: "Graduate program applicant-to-advisor matching",
      description:
        "Alongside admissibility review, workers extract research-interest signals from the statement of purpose and match candidates to potential faculty advisors with overlapping research areas, surfaced to the graduate committee as a starting point, not a placement decision.",
    },
  ],
};
