import type { Pattern } from "@/types";

export const academicPetitionApprovalGate: Pattern = {
  slug: "academic-petition-approval-gate",
  name: "Human-in-the-Loop Academic Petition Approval Gate",
  category: "Orchestration & Control Loops",
  complexity: "Intermediate",
  latency: "High (10s+, async)",
  tokenCost: "Low",
  frameworks: ["LangGraph", "Raw TypeScript", "MCP Server"],
  tags: ["higher-education", "registrar", "academic-petitions", "approval-gate", "human-in-the-loop"],
  summary:
    "An agent triages academic petitions — late withdrawals, grade appeals, prerequisite waivers, leave-of-absence requests — checking policy eligibility and assembling supporting context automatically, but every petition routes through an explicit human approval gate matched to the right approving authority before any record changes.",
  intent:
    "Academic petitions (retroactive withdrawal, grade forgiveness, prerequisite override, medical leave) sit on a policy tree that varies by department, program, and sometimes individual faculty discretion — and the outcome directly changes a student's academic and financial record. The risk isn't that an LLM can't understand the policy tree; it's that even a well-calibrated agent will occasionally be confidently wrong on an edge case, and a wrong auto-approval here can affect financial aid eligibility, degree conferral timing, or a student's transcript permanently. This pattern uses the agent purely for triage and preparation — checking eligibility against the policy tree, pulling supporting record context, and routing to the correct approver — while keeping every actual approval decision behind an explicit human gate, with the routing itself the part that's automated well enough to actually save staff time.",
  diagram: `sequenceDiagram
    autonumber
    participant St as Student
    participant Ag as Triage Agent
    participant Pol as Policy Tree Service
    participant Reg as Registrar Records
    participant Ap as Approver (advisor/dean/registrar)

    St->>Ag: Submit petition (type, term, justification, documents)
    Ag->>Pol: Check eligibility rules for petition_type + program
    Pol-->>Ag: { eligible, required_approvals[], required_docs[] }
    Ag->>Reg: Fetch supporting record context (GPA, standing, prior petitions)
    Reg-->>Ag: Student record snapshot

    alt Missing required documentation
        Ag-->>St: Request missing documents, hold petition
    else Eligible and complete
        Ag->>Ag: Draft approval packet (summary + policy citation + record context)
        Ag->>Ap: Route packet to correct approver(s) per policy tree
        Ap-->>Ag: Approve / Deny / Request more info
        alt Approved
            Ag->>Reg: Apply record change (e.g. W grade, waiver flag)
            Ag-->>St: Notify outcome
        else Denied or more info needed
            Ag-->>St: Notify outcome + next steps
        end
    end
    Note over Ag,Reg: Agent never writes to Reg without an explicit<br/>Approved event tied to a specific approver identity.`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `type PetitionType =
  | "retroactive_withdrawal"
  | "grade_appeal"
  | "prerequisite_waiver"
  | "leave_of_absence"
  | "late_add_drop";

interface PolicyRule {
  petitionType: PetitionType;
  programCode: string | "ALL";
  requiredApprovals: string[]; // e.g. ["advisor", "department_chair"]
  requiredDocuments: string[]; // e.g. ["medical_documentation"]
  eligibilityWindow: { maxDaysAfterTermEnd: number | null };
}

interface StudentRecordSnapshot {
  studentId: string;
  gpa: number;
  academicStanding: "good" | "probation" | "suspension_review";
  priorPetitions: Array<{ type: PetitionType; term: string; outcome: string }>;
}

interface PetitionSubmission {
  petitionId: string;
  studentId: string;
  type: PetitionType;
  term: string;
  justification: string;
  submittedDocuments: string[];
}

interface ApprovalPacket {
  petitionId: string;
  eligibilitySummary: string;
  policyCitation: string;
  recordContext: StudentRecordSnapshot;
  requiredApprovers: string[];
  missingDocuments: string[];
}

type ApproverDecision =
  | { decision: "approved"; approverId: string; approverRole: string; note?: string }
  | { decision: "denied"; approverId: string; approverRole: string; reason: string }
  | { decision: "more_info"; approverId: string; approverRole: string; request: string };

interface PetitionState {
  submission: PetitionSubmission;
  packet: ApprovalPacket | null;
  decisions: ApproverDecision[];
  status: "triaging" | "awaiting_documents" | "awaiting_approval" | "resolved";
  finalOutcome: "approved" | "denied" | null;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function triagePetition(
  submission: PetitionSubmission,
  policyService: PolicyTreeService,
  registrar: RegistrarClient,
  triageAgent: ChatModel,
  approvalRouter: ApprovalRouter
): Promise<PetitionState> {
  const state: PetitionState = {
    submission,
    packet: null,
    decisions: [],
    status: "triaging",
    finalOutcome: null,
  };

  const rule = await policyService.getRule(submission.type, submission.term);
  const record = await registrar.getStudentSnapshot(submission.studentId);

  const missingDocs = rule.requiredDocuments.filter(
    (doc) => !submission.submittedDocuments.includes(doc)
  );

  if (missingDocs.length > 0) {
    state.status = "awaiting_documents";
    await notifyStudent(submission.studentId, { missingDocuments: missingDocs });
    return state;
  }

  // The agent's ONLY job here is to summarize and cite policy —
  // it does not decide eligibility itself; the policy tree already did.
  const summary = await triageAgent.chat({
    messages: [
      { role: "system", content: PETITION_SUMMARY_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ submission, rule, record }),
      },
    ],
    temperature: 0.1,
  });

  state.packet = {
    petitionId: submission.petitionId,
    eligibilitySummary: summary.content!,
    policyCitation: rule.petitionType + " / " + submission.term,
    recordContext: record,
    requiredApprovers: rule.requiredApprovals,
    missingDocuments: [],
  };
  state.status = "awaiting_approval";

  await approvalRouter.route(state.packet);
  return state;
}

// Called by a webhook when an approver acts — this is the only
// function in the whole flow permitted to write to the registrar.
async function recordApproverDecision(
  petitionId: string,
  decision: ApproverDecision,
  state: PetitionState,
  registrar: RegistrarClient
): Promise<PetitionState> {
  state.decisions.push(decision);

  const stillPending = state.packet!.requiredApprovers.filter(
    (role) => !state.decisions.some((d) => d.approverRole === role)
  );

  if (decision.decision === "denied") {
    state.status = "resolved";
    state.finalOutcome = "denied";
    await notifyStudent(state.submission.studentId, { outcome: "denied", decision });
    return state;
  }

  if (decision.decision === "approved" && stillPending.length === 0) {
    // All required approvers have signed off — and only now does a write happen.
    await registrar.applyPetitionOutcome(petitionId, state.submission.type, decision);
    state.status = "resolved";
    state.finalOutcome = "approved";
    await notifyStudent(state.submission.studentId, { outcome: "approved" });
  }

  return state;
}`,
    },
  ],
  failureModes: [
    {
      title: "Policy tree ambiguity between department and registrar rules",
      description:
        "A prerequisite waiver falls under both a department-specific policy and a general registrar policy that disagree on the required approver, and the agent picks one inconsistently across similar petitions.",
      mitigation:
        "Make the policy tree service the single source of truth with an explicit precedence order (department-specific overrides general, most-specific match wins), and have the triage agent surface a policy_conflict flag rather than silently picking one interpretation when the tree itself returns ambiguous results.",
    },
    {
      title: "Stale student record snapshot at approval time",
      description:
        "A student's academic standing changes (e.g. a late grade posts, moving them from good standing to probation) between when the triage packet was assembled and when the approver acts, so the approver is deciding based on outdated context.",
      mitigation:
        "Timestamp the record snapshot in the packet and re-fetch a fresh snapshot at the moment of approval, diffing it against what the approver saw — if academic standing or GPA changed materially, flag the packet for re-review rather than applying the original decision silently.",
    },
    {
      title: "Approval routed to the wrong or unavailable approver",
      description:
        "A department chair is on sabbatical and their delegate isn't registered in the approval router's role mapping, so the petition sits unrouted and the student assumes it was lost.",
      mitigation:
        "Give every required-approval role an explicit delegate chain with expiration dates, and add an automatic staleness alert (to registrar staff, not the student) if a petition has been in awaiting_approval status longer than a configurable SLA.",
    },
    {
      title: "Agent-drafted summary subtly mischaracterizes the justification",
      description:
        "The triage agent's eligibility summary compresses a nuanced medical or personal justification into a shorter phrase that loses context material to the approver's decision, biasing the outcome.",
      mitigation:
        "Always show the approver the student's original justification text verbatim alongside the agent's summary, never the summary alone — the summary is a navigation aid, not a replacement for the source material.",
    },
  ],
  useCases: [
    {
      title: "Retroactive withdrawal petitions after a medical emergency",
      description:
        "A student who stopped attending due to a documented medical crisis submits a retroactive withdrawal request; the agent checks the eligibility window, confirms documentation, and routes to the required combination of instructor, advisor, and dean sign-off.",
    },
    {
      title: "Cross-department prerequisite waiver for transfer students",
      description:
        "A transfer student petitions to waive a prerequisite based on equivalent coursework at a prior institution; the agent assembles the transcript comparison and routes to the department chair, cutting the manual lookup time registrar staff previously spent per case.",
    },
  ],
};
