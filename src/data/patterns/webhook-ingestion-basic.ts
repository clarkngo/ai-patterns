import type { Pattern } from "@/types";

export const webhookIngestionBasic: Pattern = {
  slug: "webhook-ingestion-basic",
  name: "One-Way Webhook Ingestion to Database",
  category: "External Connectors & State Sync",
  complexity: "Beginner",
  latency: "Low (<2s)",
  tokenCost: "Low",
  frameworks: ["Raw TypeScript", "Raw Python"],
  tags: ["webhook", "beginner", "getting-started", "ingestion", "one-way-sync"],
  summary:
    "The simplest external connector: receive a webhook event, validate its shape, optionally ask an agent to extract or classify something from it, and write one row to a database. No two-way sync, no conflict resolution — just a safe, idempotent ingest path.",
  intent:
    "It's tempting to reach for a full sync framework the first time you need to react to an external event, but most integrations start as a one-way flow: something happens elsewhere (a form submission, a payment, a support ticket), and you need to record it and maybe enrich it. This pattern is the minimal, correct version of that: verify the request is genuinely from the source (not just anyone who found your URL), dedupe on a stable event ID so retries don't create duplicate rows, and only then hand anything to an agent for enrichment. Getting this simple version right — especially idempotency — is what makes the more advanced two-way sync patterns in this catalog tractable later, instead of needing to be rebuilt from scratch.",
  diagram: `flowchart TB
    Ext[External System<br/>e.g. form tool, payment provider] -->|POST webhook| EP[Webhook Endpoint]
    EP --> Verify{Signature valid?}
    Verify -->|no| Reject[401 Reject]
    Verify -->|yes| Dedupe{Event ID<br/>already processed?}
    Dedupe -->|yes| Ack1[200 OK, no-op]
    Dedupe -->|no| Parse[Parse + Validate Payload Shape]
    Parse -->|invalid shape| DeadLetter[(Dead Letter Table)]
    Parse -->|valid| Enrich[Agent: extract/classify fields]
    Enrich --> Write[(Write Row to Database)]
    Write --> Ack2[200 OK]

    DeadLetter -.->|manual review| Human[Developer/Ops]`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `interface IncomingWebhookEvent {
  eventId: string; // provided by the sender; this is your idempotency key
  eventType: string;
  payload: Record<string, unknown>;
  signature: string;
  receivedAt: string;
}

interface ParsedRecord {
  eventId: string;
  category: string; // e.g. classified by the enrichment agent
  extractedFields: Record<string, string | number | boolean>;
  rawPayload: Record<string, unknown>;
}

interface ProcessingResult {
  status: "processed" | "duplicate" | "invalid_signature" | "invalid_payload";
  eventId: string;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `import crypto from "node:crypto";

async function handleWebhook(
  request: IncomingWebhookEvent,
  rawBody: string,
  webhookSecret: string,
  db: Database,
  enrichmentAgent: ChatModel | null // optional — plenty of integrations skip this
): Promise<ProcessingResult> {
  // 1. Verify the sender is who they claim to be. Never skip this step
  //    even for "internal" integrations — webhook URLs get discovered.
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  if (!timingSafeEqual(request.signature, expectedSignature)) {
    return { status: "invalid_signature", eventId: request.eventId };
  }

  // 2. Dedupe. Senders retry on timeout, so the same event can arrive
  //    more than once — this must be safe to run twice.
  const alreadyProcessed = await db.eventExists(request.eventId);
  if (alreadyProcessed) {
    return { status: "duplicate", eventId: request.eventId };
  }

  // 3. Validate shape before doing anything expensive with it.
  const shapeCheck = validatePayloadShape(request.eventType, request.payload);
  if (!shapeCheck.valid) {
    await db.insertDeadLetter(request, shapeCheck.errors);
    return { status: "invalid_payload", eventId: request.eventId };
  }

  // 4. Enrichment is optional — many webhooks just need a straight
  //    write. Only call the model when there's genuine extraction
  //    or classification work an agent is better suited for than
  //    a plain field mapping.
  let record: ParsedRecord;
  if (enrichmentAgent) {
    const classification = await enrichmentAgent.chat({
      messages: [
        { role: "system", content: ENRICHMENT_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(request.payload) },
      ],
      responseFormat: { type: "json_schema", schema: ExtractedFieldsSchema },
      temperature: 0.0,
    });
    record = {
      eventId: request.eventId,
      category: JSON.parse(classification.content!).category,
      extractedFields: JSON.parse(classification.content!).fields,
      rawPayload: request.payload,
    };
  } else {
    record = {
      eventId: request.eventId,
      category: request.eventType,
      extractedFields: mapDirectFields(request.payload),
      rawPayload: request.payload,
    };
  }

  // 5. Write once, and mark the event ID as seen in the same
  //    transaction so a crash between the two never causes a
  //    duplicate on retry.
  await db.transaction(async (tx) => {
    await tx.insertRecord(record);
    await tx.markEventProcessed(request.eventId);
  });

  return { status: "processed", eventId: request.eventId };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}`,
    },
  ],
  failureModes: [
    {
      title: "Signature check compares strings the unsafe way",
      description:
        "Using a plain === comparison for the HMAC signature leaks timing information that, in theory, lets an attacker guess the correct signature byte by byte.",
      mitigation:
        "Always use a constant-time comparison (crypto.timingSafeEqual, or your language's equivalent) for signature checks, never a standard string equality operator.",
    },
    {
      title: "Dedup check and write aren't atomic",
      description:
        "Two webhook deliveries for the same event arrive close together; both pass the 'already processed' check before either has written its row, resulting in a duplicate.",
      mitigation:
        "Make the event ID a unique constraint at the database level, not just an application-level check, and treat a unique-constraint violation on insert as a duplicate rather than an error — the database is the real source of truth for 'have I seen this before,' not an in-memory check.",
    },
    {
      title: "Enrichment agent call blocks the webhook response past the sender's timeout",
      description:
        "Most webhook senders expect a response within a few seconds and will retry (creating more duplicate-handling work) if the endpoint is slow — calling an LLM synchronously inside the request handler risks exactly that.",
      mitigation:
        "Acknowledge the webhook immediately after signature verification and dedup check, then process enrichment and the write asynchronously in a background job or queue — never make the sender wait on a model call.",
    },
  ],
  useCases: [
    {
      title: "Contact form submissions into a leads table",
      description:
        "A marketing site's form tool posts a webhook on every submission; the agent classifies inquiry type (sales, support, partnership) before the row lands in the right table for the right team to see.",
    },
    {
      title: "Support ticket creation from a helpdesk widget",
      description:
        "A lightweight in-product widget posts raw user messages as webhooks; the agent extracts a structured summary and urgency tag before the ticket is written, without needing a full bidirectional helpdesk integration.",
    },
  ],
};
