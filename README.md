# Agent Patterns

An interactive catalog of **autonomous and semi-autonomous multi-agent system design patterns** — orchestration loops, Model Context Protocol (MCP) tooling, external state-sync connectors, multi-agent collaboration topologies, and resilience/governance architectures.

Unlike a human-in-the-loop prompt cookbook, this catalog focuses on **autonomous execution**: tool-calling loops, failure handling, state synchronization, and orchestration for agents that run with minimal supervision.

Live site: deployed automatically to GitHub Pages on every push to `main` (see [Deployment](#deployment)).

## What's in a pattern

Every entry in the catalog follows the same blueprint:

| Section | Contents |
|---|---|
| **Metadata** | Category, complexity, latency profile, token cost profile, compatible frameworks |
| **Intent** | The exact distributed/agentic problem the pattern solves |
| **Architecture Diagram** | A rendered Mermaid sequence or flowchart diagram of message/state flow |
| **State Schema** | TypeScript interfaces or Pydantic models for the agent's shared state |
| **Execution Loop & Tool Contracts** | Concrete implementation code for the tool-calling loop and decision branches |
| **Failure Modes & Edge Cases** | Timeouts, hallucinated arguments, infinite loops, rate limits — and mitigations |
| **Real-World Use Cases** | Specific, concrete scenarios where the pattern applies |

## Categories

- **Orchestration & Control Loops** — ReAct loops, Plan-and-Solve, Router-Worker hierarchies, Evaluator-Optimizer loops, human-in-the-loop approval gates.
- **Tooling & MCP Protocols** — MCP server wiring, client-server schemas, dynamic tool discovery, sandboxed code execution.
- **External Connectors & State Sync** — two-way CRM syncs, Google Sheets pipelines, webhook ingestion, relational/vector DB sync.
- **Multi-Agent Collaboration** — swarm handoffs, debate/consensus, supervisor-worker topologies, broadcast-gather.
- **Resilience & Governance** — self-healing loops, retry/backoff, token budget throttling, guardrail validation, structured fallback schemas.

## Tech stack

- **Vite + TypeScript** — no framework, no server-side runtime. Ships as static HTML/CSS/JS.
- **Tailwind CSS** — utility-first styling, dark/light mode via the `class` strategy.
- **Mermaid.js** — lazy-loaded, renders architecture diagrams client-side.
- **MiniSearch** — in-browser full-text search across pattern name, summary, intent, tags, and use cases. No backend, no network calls.

## Getting started

```bash
npm install
npm run dev
```

This starts a Vite dev server with hot module reload. Open the printed local URL in your browser.

### Build for production

```bash
npm run build
```

Outputs a fully static site to `dist/`. Preview it locally with:

```bash
npm run preview
```

## Project structure

```
ai-patterns/
├── .github/workflows/deploy.yml   # Build + deploy to GitHub Pages on push to main
├── index.html                     # Single entry point (SPA shell)
├── src/
│   ├── main.ts                    # App bootstrap: header, sidebar, router wiring
│   ├── state.ts                   # Filter store (category/framework/complexity/search)
│   ├── types.ts                   # Pattern blueprint schema
│   ├── style.css                  # Tailwind directives + small custom styles
│   ├── components/
│   │   ├── patternCard.ts         # Catalog grid card
│   │   ├── sidebar.ts             # Filter chips + pattern nav list
│   │   ├── tabs.ts                # Generic tab component (used for code blocks)
│   │   └── codeBlock.ts           # Syntax-labeled code block with copy button
│   ├── views/
│   │   ├── catalog.ts             # Grid view (home route)
│   │   └── patternDetail.ts       # Full pattern blueprint page
│   ├── lib/
│   │   ├── router.ts              # Minimal hash-based router
│   │   ├── search.ts              # MiniSearch index + query
│   │   ├── mermaid.ts             # Lazy-loaded Mermaid rendering
│   │   ├── theme.ts               # Dark/light mode toggle + persistence
│   │   ├── clipboard.ts           # Copy-to-clipboard with fallback
│   │   ├── badges.ts              # Category/complexity color mappings
│   │   ├── dom.ts                 # Tiny `h()` element-builder helper
│   │   └── visiblePatterns.ts     # Combines search + filter state
│   └── data/patterns/             # One file per pattern (see CONTRIBUTING.md)
└── public/favicon.svg
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which:

1. Installs dependencies (`npm ci`)
2. Runs `npm run build` (type-checks with `tsc -b`, then builds with Vite)
3. Uploads `dist/` as a Pages artifact
4. Deploys it to GitHub Pages

**One-time setup:** in your repository, go to **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**. No other configuration is required — `vite.config.ts` uses a relative `base: "./"`, so the build works whether it's served from a user/org site (`username.github.io`) or a project site (`username.github.io/repo-name`).

## Adding a new pattern

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full pattern submission guide.
