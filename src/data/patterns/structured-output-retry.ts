import type { Pattern } from "@/types";

export const structuredOutputRetry: Pattern = {
  slug: "structured-output-retry",
  name: "Structured Output with Retry and Fallback",
  category: "Resilience & Governance",
  complexity: "Beginner",
  latency: "Low (<2s)",
  tokenCost: "Low",
  frameworks: ["Raw TypeScript", "Raw Python"],
  tags: ["structured-output", "beginner", "getting-started", "retry", "json-schema", "fallback"],
  summary:
    "The first resilience pattern almost every agent needs: ask the model for JSON matching a schema, validate it, and if it's malformed, feed the exact validation error back for one retry — with a safe, well-typed fallback if it still fails.",
  intent:
    "Before you need retry/backoff for rate limits or guardrails for compliance, you need your code to stop crashing every time a model returns JSON with a missing field, a wrong type, or a trailing comma. This happens more often than it should, even with 'JSON mode' or function-calling enabled, especially with longer or more nested schemas. The fix isn't to write more defensive parsing code — it's to treat a schema validation failure as a normal, expected event: catch it, tell the model exactly what was wrong in terms it can act on, and give it one more try before falling back to a safe default. This one pattern, done consistently, eliminates most of the 'the agent randomly crashed' bug reports in a typical project.",
  diagram: `flowchart TB
    Req[Build Prompt + JSON Schema] --> Call1[Call Model]
    Call1 --> Parse1{Parses and<br/>matches schema?}
    Parse1 -->|yes| Done[Return Validated Object]
    Parse1 -->|no| Feedback[Build Retry Prompt:<br/>original request + exact validation error]
    Feedback --> Call2[Call Model Again]
    Call2 --> Parse2{Parses and<br/>matches schema?}
    Parse2 -->|yes| Done
    Parse2 -->|no| Fallback[Return Typed Fallback Value<br/>+ log for later review]`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `import { z } from "zod";

// Example schema — swap this for whatever shape your task needs.
const SentimentResultSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
  keyPhrases: z.array(z.string()).max(5),
});

type SentimentResult = z.infer<typeof SentimentResultSchema>;

interface StructuredCallResult<T> {
  value: T;
  usedFallback: boolean;
  attempts: number;
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `import { z } from "zod";

async function getStructuredOutput<T>(
  prompt: string,
  schema: z.ZodType<T>,
  model: ChatModel,
  fallback: T,
  maxAttempts = 2
): Promise<StructuredCallResult<T>> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // On retry, the model sees exactly what went wrong last time —
    // not a generic "try again," but the actual validation failure.
    const messages: ChatMessage[] = [
      { role: "system", content: "Respond with JSON matching the given schema. No prose, no markdown fences." },
      { role: "user", content: prompt },
    ];
    if (lastError) {
      messages.push({
        role: "user",
        content: \`Your previous response failed validation: \${lastError}\\nPlease correct it and respond again with valid JSON only.\`,
      });
    }

    const response = await model.chat({ messages, temperature: 0.0 });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripCodeFences(response.content ?? ""));
    } catch (err) {
      lastError = \`Response was not valid JSON: \${err}\`;
      continue;
    }

    const result = schema.safeParse(parsedJson);
    if (result.success) {
      return { value: result.data, usedFallback: false, attempts: attempt };
    }

    // zod's error formatting is already specific enough to hand
    // straight back to the model — no need to write your own.
    lastError = result.error.issues
      .map((issue) => \`\${issue.path.join(".")}: \${issue.message}\`)
      .join("; ");
  }

  // Both attempts failed — return a well-typed fallback rather than
  // letting an exception propagate into unrelated application code.
  await logStructuredOutputFailure(prompt, lastError);
  return { value: fallback, usedFallback: true, attempts: maxAttempts };
}

function stripCodeFences(text: string): string {
  // Models sometimes wrap JSON in \`\`\`json ... \`\`\` even when told not to.
  return text.replace(/^\`\`\`(?:json)?\\n?/, "").replace(/\\n?\`\`\`$/, "").trim();
}

// Usage:
const { value, usedFallback } = await getStructuredOutput(
  "Analyze the sentiment of: 'The new update is confusing but the support team was great.'",
  SentimentResultSchema,
  model,
  { sentiment: "neutral", confidence: 0, keyPhrases: [] } // safe default
);`,
    },
  ],
  failureModes: [
    {
      title: "Retry prompt doesn't actually contain the error",
      description:
        "A common mistake is retrying with a generic 'please try again' message instead of the specific validation failure, which usually produces the exact same wrong output a second time.",
      mitigation:
        "Always include the precise validation error (field path and expected type/constraint) in the retry message, as shown above — specificity is what makes the retry actually more likely to succeed than the first attempt.",
    },
    {
      title: "Fallback value is treated as a real result downstream",
      description:
        "Code that calls getStructuredOutput uses value without checking usedFallback, so a sentiment analysis silently defaults to 'neutral' with zero confidence and nothing downstream notices the model call actually failed twice.",
      mitigation:
        "Always check usedFallback at the call site and route it to logging, a metrics counter, or a degraded-mode UI state — a fallback value should be visibly different behavior, not indistinguishable from a real result.",
    },
    {
      title: "Schema is too strict for what the task actually needs",
      description:
        "An overly rigid schema (e.g. requiring exactly 5 keyPhrases instead of 'up to 5') causes valid, useful model outputs to fail validation repeatedly, burning both retry attempts on a schema problem rather than a model problem.",
      mitigation:
        "When a particular schema fails validation often across many different inputs (not just occasionally), treat that as a signal to loosen the schema — constraints should reflect what your downstream code actually requires, not an arbitrary ideal shape.",
    },
  ],
  useCases: [
    {
      title: "Any feature that parses a model's response programmatically",
      description:
        "Sentiment tagging, entity extraction, classification, form-filling from natural language — essentially any place where code, not a human, reads the model's output next.",
    },
    {
      title: "The first layer under every other pattern in this catalog",
      description:
        "Every multi-step or multi-agent pattern here that expects a model to return structured JSON (tool arguments, evaluator verdicts, routing decisions) should sit on top of this pattern rather than assuming the model will always comply.",
    },
  ],
};
