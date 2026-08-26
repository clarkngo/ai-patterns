import type { Pattern } from "@/types";

export const selfHealingSheetsCrmSync: Pattern = {
  slug: "self-healing-sheets-crm-sync",
  name: "Self-Healing Two-Way Google Sheets/CRM Sync",
  category: "External Connectors & State Sync",
  complexity: "Production-Grade",
  latency: "High (10s+, async)",
  tokenCost: "Variable (tool-bound)",
  frameworks: ["Raw TypeScript", "MCP Server", "LangGraph"],
  tags: ["sync", "crm", "google-sheets", "webhooks", "conflict-resolution", "resilience"],
  summary:
    "An event-driven agent keeps a Google Sheet and a CRM's contact/deal records in sync in both directions, using an agent to resolve field-level conflicts and self-heal after transient failures instead of hard-failing the sync.",
  intent:
    "Two-way sync between a human-editable spreadsheet and a CRM is deceptively hard: both sides can change the same record between sync ticks, APIs rate-limit and time out mid-batch, and a naive last-write-wins policy silently destroys data. This pattern uses deterministic code for the parts that are deterministic (diffing, batching, retries) and reserves the LLM agent for the part that genuinely needs judgment: deciding how to reconcile a conflicting field update using context a hardcoded rule can't capture (e.g. \"the CRM value looks like a bounced auto-import, prefer the sheet\").",
  diagram: `flowchart LR
    subgraph Sources
      GS[Google Sheets]
      CRM[CRM API]
    end

    GS -- webhook: row changed --> Q[Event Queue]
    CRM -- webhook: record updated --> Q

    Q --> D[Change Detector]
    D --> Diff{Diff against<br/>last-synced snapshot}

    Diff -->|no conflict| Apply[Deterministic Applier]
    Diff -->|conflicting field edit| CA[Conflict-Resolution Agent]

    CA -->|resolved value + rationale| Apply
    CA -->|ambiguous, needs human| HITL[Human Approval Queue]

    Apply -->|write| GS
    Apply -->|write| CRM
    Apply --> Snap[(Sync State Store:<br/>last-synced snapshot + version)]

    Apply -.->|on failure| Retry[Retry w/ Backoff]
    Retry -->|max attempts exceeded| DLQ[(Dead Letter Queue)]
    DLQ --> Alert[Slack/PagerDuty Alert]
    HITL -->|human decides| Apply`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `interface FieldSnapshot {
  value: unknown;
  source: "sheet" | "crm";
  syncedAt: string; // ISO timestamp
  sourceVersion: string; // sheet revisionId or CRM record updatedAt
}

interface RecordSnapshot {
  recordId: string; // stable join key, e.g. CRM contact ID mirrored in a sheet column
  fields: Record<string, FieldSnapshot>;
}

interface ChangeEvent {
  source: "sheet" | "crm";
  recordId: string;
  changedFields: Record<string, unknown>;
  observedAt: string;
  rawEventId: string; // for idempotency / dedup
}

interface ConflictCase {
  recordId: string;
  field: string;
  sheetValue: unknown;
  crmValue: unknown;
  sheetUpdatedAt: string;
  crmUpdatedAt: string;
}

interface ConflictResolution {
  field: string;
  resolvedValue: unknown;
  chosenSource: "sheet" | "crm" | "merged";
  rationale: string;
  confidence: number;
}

interface SyncJobState {
  jobId: string;
  event: ChangeEvent;
  priorSnapshot: RecordSnapshot | null;
  conflicts: ConflictCase[];
  resolutions: ConflictResolution[];
  status: "pending" | "applied" | "needs_human" | "dead_letter";
  attempt: number;
  maxAttempts: number;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `async function processChangeEvent(
  event: ChangeEvent,
  store: SyncStateStore,
  sheet: SheetsClient,
  crm: CrmClient,
  conflictAgent: ChatModel,
  maxAttempts = 5
): Promise<SyncJobState> {
  const job: SyncJobState = {
    jobId: crypto.randomUUID(),
    event,
    priorSnapshot: await store.getSnapshot(event.recordId),
    conflicts: [],
    resolutions: [],
    status: "pending",
    attempt: 0,
    maxAttempts,
  };

  // Idempotency guard: skip if this exact webhook event was already applied.
  if (await store.isEventProcessed(event.rawEventId)) {
    job.status = "applied";
    return job;
  }

  job.conflicts = detectConflicts(event, job.priorSnapshot);

  if (job.conflicts.length > 0) {
    for (const conflict of job.conflicts) {
      const resolution = await resolveConflict(conflict, conflictAgent);
      if (resolution.confidence < 0.7) {
        job.status = "needs_human";
        await store.enqueueForHumanReview(job, conflict, resolution);
        continue;
      }
      job.resolutions.push(resolution);
    }
    if (job.status === "needs_human") return job;
  }

  await applyWithRetry(job, sheet, crm, store);
  return job;
}

async function applyWithRetry(
  job: SyncJobState,
  sheet: SheetsClient,
  crm: CrmClient,
  store: SyncStateStore
): Promise<void> {
  const merged = mergeFields(job.event, job.resolutions);

  while (job.attempt < job.maxAttempts) {
    job.attempt++;
    try {
      // Write to the side that did NOT originate the change, then
      // persist the new snapshot atomically so a crash mid-write is
      // recoverable from the last-known-good state, not a half-applied one.
      if (job.event.source === "sheet") {
        await crm.upsertRecord(job.event.recordId, merged);
      } else {
        await sheet.upsertRow(job.event.recordId, merged);
      }
      await store.commitSnapshot(job.event.recordId, merged, job.event.rawEventId);
      job.status = "applied";
      return;
    } catch (err) {
      if (isRateLimited(err)) {
        await sleep(backoffMs(job.attempt) + jitter());
        continue;
      }
      if (isTransient(err) && job.attempt < job.maxAttempts) {
        await sleep(backoffMs(job.attempt));
        continue;
      }
      // Non-transient or budget exhausted — dead-letter instead of dropping silently.
      job.status = "dead_letter";
      await store.sendToDeadLetterQueue(job, err);
      return;
    }
  }
}

async function resolveConflict(
  conflict: ConflictCase,
  agent: ChatModel
): Promise<ConflictResolution> {
  const response = await agent.chat({
    messages: [
      { role: "system", content: CONFLICT_RESOLUTION_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(conflict) },
    ],
    responseFormat: { type: "json_schema", schema: ConflictResolutionSchema },
    temperature: 0.0,
  });
  return JSON.parse(response.content!) as ConflictResolution;
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt); // capped exponential backoff
}`,
    },
    {
      label: "Conflict Detection",
      language: "typescript",
      code: `function detectConflicts(
  event: ChangeEvent,
  prior: RecordSnapshot | null
): ConflictCase[] {
  if (!prior) return []; // first sync for this record — nothing to conflict with

  const conflicts: ConflictCase[] = [];
  for (const [field, newValue] of Object.entries(event.changedFields)) {
    const snapshot = prior.fields[field];
    if (!snapshot) continue;

    // A conflict exists only if the OTHER side also diverged from the
    // last-synced value since the last sync — i.e. both sides touched
    // the same field independently. A change on only one side is not
    // a conflict; it's just a normal propagation.
    const otherSideDiverged =
      snapshot.source !== event.source &&
      snapshot.value !== newValue &&
      new Date(snapshot.syncedAt) < new Date(event.observedAt);

    if (otherSideDiverged) {
      conflicts.push({
        recordId: event.recordId,
        field,
        sheetValue: event.source === "sheet" ? newValue : snapshot.value,
        crmValue: event.source === "crm" ? newValue : snapshot.value,
        sheetUpdatedAt:
          event.source === "sheet" ? event.observedAt : snapshot.syncedAt,
        crmUpdatedAt:
          event.source === "crm" ? event.observedAt : snapshot.syncedAt,
      });
    }
  }
  return conflicts;
}`,
    },
  ],
  failureModes: [
    {
      title: "Webhook storm causes duplicate writes",
      description:
        "Google Sheets and CRM webhooks can both fire multiple times for one logical edit (e.g. a batch paste triggers a webhook per cell), causing the same change to be processed and written back multiple times, sometimes ping-ponging between systems.",
      mitigation:
        "Dedup on rawEventId before processing, and use a short debounce window per recordId that coalesces rapid-fire events into a single diff against the last-synced snapshot before touching either API.",
    },
    {
      title: "Conflict-resolution agent is overconfident on a bad merge",
      description:
        "The LLM returns a high-confidence resolution that is actually wrong (e.g. concatenating two phone numbers instead of picking one), and the loop applies it without review.",
      mitigation:
        "Calibrate the confidence threshold empirically against a labeled conflict dataset, always log the full rationale for audit, and route anything touching high-risk fields (email, payment terms) to human review regardless of stated confidence.",
    },
    {
      title: "Rate limit exhaustion during bulk import",
      description:
        "A CSV bulk-import into the CRM fires thousands of webhook events in seconds, exhausting the Sheets API quota and causing legitimate syncs to fail with 429s.",
      mitigation:
        "Apply exponential backoff with jitter (shown above) plus a token-bucket rate limiter in front of each API client, and batch downstream writes where the API supports it instead of one call per field change.",
    },
    {
      title: "Silent data loss on partial batch failure",
      description:
        "A batch write partially succeeds (3 of 5 records updated) before the process crashes, leaving the sync-state snapshot out of sync with reality.",
      mitigation:
        "Commit the snapshot per-record immediately after each successful write (not after the whole batch), so a crash mid-batch only leaves the un-committed records to be retried, not double-applied.",
    },
  ],
  useCases: [
    {
      title: "Sales team spreadsheet as a CRM front-end",
      description:
        "Reps who prefer working in Sheets get live-updating deal data, while updates they make (stage, next-step notes) sync back to the CRM of record without a human running exports.",
    },
    {
      title: "Marketing list hygiene sync",
      description:
        "A marketing team maintains a curated opt-out list in Sheets; the sync agent reconciles it against CRM unsubscribe events, using judgment to resolve cases where a contact appears re-subscribed on one side after a bounce on the other.",
    },
  ],
};
