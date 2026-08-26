import type { Pattern } from "@/types";

export const financialAidGuardrails: Pattern = {
  slug: "financial-aid-guardrails",
  name: "Guardrail-Validated Financial Aid Determination",
  category: "Resilience & Governance",
  complexity: "Production-Grade",
  latency: "Medium (2-10s)",
  tokenCost: "Moderate",
  frameworks: ["Raw TypeScript", "Raw Python", "MCP Server"],
  tags: ["higher-education", "financial-aid", "compliance", "guardrails", "ferpa", "title-iv"],
  summary:
    "An agent pre-screens financial aid eligibility and packaging against federal (Title IV) and institutional policy, validating every output against a versioned rule engine before it ever reaches a student — with a structured fallback and mandatory human sign-off on anything the guardrail can't confirm.",
  intent:
    "Financial aid determinations are federally regulated, audited, and directly affect whether a student can afford to enroll — an LLM confidently stating an incorrect Pell Grant eligibility or aid package amount is not a UX bug, it's a compliance incident and a harm to a real student. This pattern treats the LLM strictly as a drafting and explanation layer: it proposes a determination, but a deterministic rule engine (encoding current Title IV, state, and institutional policy) validates every numeric and eligibility claim before anything is shown to a student or written to the SIS. Anything the rule engine can't fully validate is escalated to a financial aid officer rather than guessed at, and every determination — automated or escalated — is written to an immutable audit log tied to the exact policy version in effect at the time.",
  diagram: `flowchart TB
    App[Student Aid Application + FAFSA Data] --> Agent[Drafting Agent]
    Agent -->|proposed determination JSON| GV{Guardrail Validator}

    Policy[(Versioned Policy Rule Engine:<br/>Title IV, state, institutional)] --> GV

    GV -->|all rules pass| Auto[Auto-Approved Determination]
    GV -->|rule violation or low confidence| Fallback[Structured Fallback Schema]
    Fallback --> FAO[Financial Aid Officer Queue]
    FAO -->|reviewed and confirmed| Final[Final Determination]

    Auto --> Audit[(Immutable Audit Log:<br/>policy_version, inputs, decision)]
    Final --> Audit

    Auto --> SIS[Student Information System]
    Final --> SIS

    subgraph Throttle[Peak-Season Token Budget Throttle]
      Agent
    end
    Bucket[(Token Budget Bucket)] -.->|rate limits| Throttle`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `interface PolicyVersion {
  id: string; // e.g. "title-iv-2026-27_institutional-v3"
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface AidDetermination {
  studentId: string;
  awardYear: string;
  efc: number; // expected family contribution (or SAI under current formula)
  eligiblePrograms: Array<{
    programCode: string; // "PELL" | "FSEOG" | "DIRECT_SUB" | "INSTITUTIONAL_GRANT" | ...
    amount: number;
    reasoning: string;
  }>;
  totalAidOffered: number;
  unmetNeed: number;
}

type GuardrailViolationSeverity = "blocker" | "review_required";

interface GuardrailViolation {
  rule: string; // e.g. "pell_amount_exceeds_max_award_table"
  severity: GuardrailViolationSeverity;
  expected: unknown;
  actual: unknown;
  explanation: string;
}

interface GuardrailResult {
  determination: AidDetermination;
  policyVersion: PolicyVersion;
  violations: GuardrailViolation[];
  status: "auto_approved" | "needs_officer_review";
}

interface AuditEntry {
  auditId: string;
  studentId: string;
  policyVersionId: string;
  inputsHash: string; // hash of raw FAFSA/application inputs, for reproducibility
  result: GuardrailResult;
  decidedBy: "system" | { officerId: string };
  timestamp: string;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function determineAid(
  studentId: string,
  application: AidApplicationData,
  draftingAgent: ChatModel,
  policyEngine: PolicyRuleEngine,
  auditLog: AuditLog,
  tokenBudget: TokenBudgetBucket
): Promise<GuardrailResult> {
  // Peak-season throttle: aid season sees enormous traffic spikes right
  // before enrollment deadlines. Fail loudly into a queue rather than
  // degrading silently or blowing the institution's model spend.
  if (!(await tokenBudget.tryAcquire(studentId))) {
    return queueForOfficerReview(studentId, application, "token_budget_exhausted");
  }

  const policyVersion = await policyEngine.currentVersion();

  const draft = await draftingAgent.chat({
    messages: [
      { role: "system", content: buildAidDraftingPrompt(policyVersion) },
      { role: "user", content: JSON.stringify(application) },
    ],
    responseFormat: { type: "json_schema", schema: AidDeterminationSchema },
    temperature: 0.0,
  });

  let determination: AidDetermination;
  try {
    determination = AidDeterminationSchema.parse(JSON.parse(draft.content!));
  } catch (err) {
    // Malformed output is itself a guardrail failure — never let a parse
    // error propagate as a silent default determination.
    return queueForOfficerReview(studentId, application, \`parse_error: \${err}\`);
  }

  const violations = policyEngine.validate(determination, application, policyVersion);
  const hasBlocker = violations.some((v) => v.severity === "blocker");

  const result: GuardrailResult = {
    determination,
    policyVersion,
    violations,
    status: hasBlocker || violations.length > 0 ? "needs_officer_review" : "auto_approved",
  };

  await auditLog.record({
    auditId: crypto.randomUUID(),
    studentId,
    policyVersionId: policyVersion.id,
    inputsHash: hashInputs(application),
    result,
    decidedBy: result.status === "auto_approved" ? "system" : { officerId: "PENDING" },
    timestamp: new Date().toISOString(),
  });

  return result;
}

function queueForOfficerReview(
  studentId: string,
  application: AidApplicationData,
  reason: string
): GuardrailResult {
  // Structured fallback: even a failure mode produces a well-typed object,
  // never a bare exception the UI has to special-case.
  return {
    determination: buildZeroStateDetermination(studentId, application),
    policyVersion: { id: "unknown", effectiveFrom: "", effectiveTo: null },
    violations: [
      {
        rule: "system_fallback",
        severity: "review_required",
        expected: "successful_auto_determination",
        actual: reason,
        explanation: \`Automated determination could not complete: \${reason}\`,
      },
    ],
    status: "needs_officer_review",
  };
}`,
    },
    {
      label: "Guardrail Rule Engine (excerpt)",
      language: "typescript",
      code: `function validate(
  determination: AidDetermination,
  application: AidApplicationData,
  policy: ResolvedPolicy
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  const pell = determination.eligiblePrograms.find((p) => p.programCode === "PELL");
  if (pell) {
    const maxAward = policy.pellMaxAwardTable.lookup(determination.efc, determination.awardYear);
    if (pell.amount > maxAward) {
      violations.push({
        rule: "pell_amount_exceeds_max_award_table",
        severity: "blocker",
        expected: \`<= \${maxAward}\`,
        actual: pell.amount,
        explanation: "Pell award exceeds the federal maximum for this EFC/SAI band.",
      });
    }
  }

  const totalDirectLoans = sumProgram(determination, "DIRECT_SUB", "DIRECT_UNSUB");
  const annualLoanCap = policy.directLoanAnnualCap(application.dependencyStatus, application.gradeLevel);
  if (totalDirectLoans > annualLoanCap) {
    violations.push({
      rule: "direct_loan_annual_cap_exceeded",
      severity: "blocker",
      expected: \`<= \${annualLoanCap}\`,
      actual: totalDirectLoans,
      explanation: "Combined subsidized/unsubsidized loan total exceeds the annual federal cap.",
    });
  }

  if (determination.totalAidOffered > application.costOfAttendance) {
    violations.push({
      rule: "total_aid_exceeds_cost_of_attendance",
      severity: "blocker",
      expected: \`<= \${application.costOfAttendance}\`,
      actual: determination.totalAidOffered,
      explanation: "Total aid package cannot exceed the student's cost of attendance.",
    });
  }

  return violations;
}`,
    },
  ],
  failureModes: [
    {
      title: "Prompt injection via applicant-submitted free-text fields",
      description:
        "A student's special-circumstances appeal essay (submitted as free text) contains text designed to make the drafting agent output an inflated award, and the model partially complies before the guardrail catches it.",
      mitigation:
        "Never let free-text applicant input influence the structured numeric fields directly — route special-circumstances narratives to a separate, clearly-labeled 'context for human review' field that the rule engine ignores entirely for eligibility math, and have a human read it as narrative context only.",
    },
    {
      title: "Stale policy version after a mid-year federal formula change",
      description:
        "The Department of Education updates the Student Aid Index formula or Pell award table mid-cycle; the deployed policy engine still validates against the prior version, silently auto-approving determinations that are technically wrong under the new rules.",
      mitigation:
        "Store policy effective date ranges explicitly and fail closed — if no policy version is marked effective for the application's award year and current date, route to officer review rather than falling back to the most recent version by default.",
    },
    {
      title: "Token budget throttle creates a backlog cliff at deadlines",
      description:
        "Every student who gets throttled during a traffic spike lands in the officer review queue at once, right before an enrollment deadline, overwhelming a financial aid office that expected the automation to absorb the volume.",
      mitigation:
        "Track queue depth as a first-class metric with alerting, and pre-provision additional token budget ahead of known deadline dates (admitted-student deposit deadlines, FAFSA priority dates) rather than relying on a flat daily budget year-round.",
    },
    {
      title: "Audit log divergence from what the student actually saw",
      description:
        "A determination is recomputed after a data correction, but the audit log entry the compliance team pulls references the original (superseded) determination, making it look like the student was shown incorrect information when they weren't.",
      mitigation:
        "Never overwrite an audit entry — every recomputation creates a new entry linked to the prior one via a supersedes field, so the full history of what was shown to the student and when is always reconstructable.",
    },
  ],
  useCases: [
    {
      title: "Automated Pell Grant and subsidized loan pre-packaging",
      description:
        "The majority of standard-profile applicants (no special circumstances, complete FAFSA data) get an accurate award letter within minutes instead of waiting weeks in a manual review queue, while edge cases route to officers automatically.",
    },
    {
      title: "Special-circumstances appeal triage",
      description:
        "Students appealing their EFC/SAI due to job loss or other documented hardship get their narrative summarized and their documentation checklist validated by the agent, but the actual re-determination always requires officer sign-off.",
    },
  ],
};
