# Contributing a Pattern

Every pattern is a single TypeScript file in [`src/data/patterns/`](src/data/patterns/) that exports an object matching the `Pattern` type in [`src/types.ts`](src/types.ts). This guide walks through adding one from scratch.

## 1. Pick a slug and category

The slug is the kebab-case identifier used in the URL (`#/pattern/<slug>`) and as the filename: `src/data/patterns/<slug>.ts`.

Choose one of the five existing categories, or propose a new one by extending the `PatternCategory` union in `src/types.ts` (and adding a color mapping in `src/lib/badges.ts` if you do):

- `Orchestration & Control Loops`
- `Tooling & MCP Protocols`
- `External Connectors & State Sync`
- `Multi-Agent Collaboration`
- `Resilience & Governance`

## 2. Fill out the schema

Every field in `Pattern` is required. Here's what each one is for and how to write it well:

| Field | Guidance |
|---|---|
| `name` | Title case, specific enough to distinguish from similar patterns (e.g. "Router-Worker with MCP Tooling", not just "Router Pattern"). |
| `complexity` | `Beginner` (single loop, no external state), `Intermediate` (multiple agents or external tools, bounded retries), or `Production-Grade` (handles conflict resolution, dead-lettering, or cross-system consistency). |
| `latency` | Pick one of the three bands already used across the catalog (`Low (<2s)`, `Medium (2-10s)`, `High (10s+, async)`) so filtering stays meaningful. |
| `tokenCost` | `Low`, `Moderate`, `High`, or `Variable (tool-bound)` if cost depends heavily on external API usage rather than model calls. |
| `frameworks` | Only list frameworks the pattern is genuinely idiomatic in — don't list a framework just because the pattern *could* be ported to it. |
| `summary` | One or two sentences. This is what shows on the catalog card — make it stand alone without the rest of the page. |
| `intent` | The problem statement. Say what goes wrong *without* this pattern, not just what the pattern does. |
| `diagram` | Valid Mermaid syntax (`sequenceDiagram` or `flowchart`). Test it renders before committing — see step 3. |
| `codeBlocks` | At minimum: a state schema and an execution loop. Use real, runnable-shaped code (correct syntax, realistic function signatures) — pseudocode reads as unfinished. |
| `failureModes` | Each entry needs a concrete failure scenario (not "it might fail") and a specific mitigation, not "add error handling." |
| `useCases` | Name an actual scenario with enough specificity that a reader can picture the integration (systems involved, trigger, outcome). |

## 3. Preview your diagram and page

```bash
npm run dev
```

Navigate to `#/pattern/<your-slug>` (you'll need to register it first — see step 4) and confirm:

- The Mermaid diagram renders without a "Diagram failed to render" error.
- Code blocks show correct syntax highlighting (no stray backticks/template literal escaping issues — this repo uses raw template strings for code samples, so escape any literal `` ` `` or `${` inside your code with a backslash).
- Tabs switch correctly between your code blocks.
- The pattern shows up under the right category/framework/complexity filters.

## 4. Register the pattern

Import and add your pattern object to the `patterns` array in [`src/data/patterns/index.ts`](src/data/patterns/index.ts):

```typescript
import { yourPatternSlug } from "./your-pattern-slug";

export const patterns: Pattern[] = [
  // ...existing patterns,
  yourPatternSlug,
];
```

It will automatically appear in the catalog grid, the sidebar nav, the category/framework/complexity filters, and the search index — no other wiring is needed.

## 5. Type-check and build

```bash
npm run build
```

This runs `tsc -b` before building, so a missing field or type mismatch in your pattern object will fail the build with a clear error pointing at the file.

## Style notes

- Don't editorialize about frameworks in `failureModes` or `useCases` — keep those sections concrete and technical.
- Prefer TypeScript for code blocks unless the pattern is inherently Python-flavored (e.g. Pydantic-heavy state schemas), matching the existing mix in the catalog.
- Keep `intent` to a single paragraph. If you need more space, the problem statement is probably too broad for one pattern — consider splitting it into two.
