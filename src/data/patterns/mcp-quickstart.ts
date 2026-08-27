import type { Pattern } from "@/types";

export const mcpQuickstart: Pattern = {
  slug: "mcp-quickstart",
  name: "Basic MCP Client: Connect, Discover, Call",
  category: "Tooling & MCP Protocols",
  complexity: "Beginner",
  latency: "Low (<2s)",
  tokenCost: "Low",
  frameworks: ["MCP Server", "Raw TypeScript", "Raw Python"],
  tags: ["mcp", "beginner", "getting-started", "tool-discovery", "single-server"],
  summary:
    "The smallest useful Model Context Protocol integration: connect to one MCP server, ask it what tools it has, and let an agent call one. No routing, no caching, no multi-server orchestration — just the three calls every MCP integration is built from.",
  intent:
    "MCP can look intimidating from the spec alone — transports, capability negotiation, JSON-RPC framing — but almost none of that complexity is yours to manage if you're using an existing SDK. This pattern strips MCP down to the three calls that actually matter day to day: connect to a server, call list_tools to discover what it offers (instead of hardcoding a tool list), and call call_tool when the model wants to use one. Once this loop feels boring and obvious, the more advanced patterns in this catalog (dynamic multi-server discovery, router-worker dispatch) are just this same loop repeated with more bookkeeping around it — not a different idea.",
  diagram: `sequenceDiagram
    autonumber
    participant App as Your App
    participant Client as MCP Client (SDK)
    participant Server as MCP Server (e.g. a weather API wrapper)
    participant Model as LLM

    App->>Client: connect(server_command)
    Client->>Server: initialize (capability negotiation)
    Server-->>Client: capabilities { tools: true }

    App->>Client: list_tools()
    Client->>Server: tools/list
    Server-->>Client: [ { name, description, inputSchema }, ... ]
    Client-->>App: tool schemas

    App->>Model: chat(user_message, tools=tool_schemas)
    Model-->>App: tool_call: get_weather({ city: "Seattle" })

    App->>Client: call_tool("get_weather", { city: "Seattle" })
    Client->>Server: tools/call
    Server-->>Client: { temperature_f: 58, condition: "cloudy" }
    Client-->>App: tool result

    App->>Model: chat(..., tool_result)
    Model-->>App: "It's 58°F and cloudy in Seattle."`,
  codeBlocks: [
    {
      label: "State Schema",
      language: "typescript",
      code: `interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolCallResult {
  content: unknown;
  isError: boolean;
}

// Everything this pattern needs to track — no cache, no TTL,
// no multi-server bookkeeping. That comes later, if you need it.
interface QuickstartSession {
  connected: boolean;
  availableTools: McpToolSchema[];
}`,
    },
    {
      label: "Execution Loop",
      language: "typescript",
      code: `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runQuickstart(userMessage: string, model: ChatModel) {
  // 1. Connect. Most MCP servers ship as a small local process you
  //    launch over stdio — no networking to think about yet.
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@example/weather-mcp-server"],
  });
  const client = new Client({ name: "quickstart-app", version: "1.0.0" });
  await client.connect(transport);

  // 2. Discover. Never hardcode what a server can do — ask it.
  const { tools } = await client.listTools();

  // 3. Let the model decide whether to use a tool.
  const response = await model.chat({
    messages: [{ role: "user", content: userMessage }],
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });

  if (response.toolCalls?.length) {
    const call = response.toolCalls[0];

    // 4. Call it. The server does the real work; you just relay.
    const result = await client.callTool({
      name: call.name,
      arguments: call.arguments,
    });

    // 5. Give the result back to the model for a final answer.
    const final = await model.chat({
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: null, toolCalls: [call] },
        { role: "tool", content: JSON.stringify(result.content) },
      ],
    });
    await client.close();
    return final.content;
  }

  await client.close();
  return response.content;
}`,
    },
  ],
  failureModes: [
    {
      title: "Server process fails to start",
      description:
        "The command used to launch the MCP server (e.g. a missing npx package, wrong path) fails silently or throws deep inside the SDK, and the error message doesn't make it obvious the server never came up.",
      mitigation:
        "Always wrap client.connect() in a try/catch that logs the raw error and the exact command that was run, and check the server's own stderr output (most SDKs let you pipe it) before assuming the problem is in your application code.",
    },
    {
      title: "Model calls a tool with a typo'd name",
      description:
        "The model hallucinates a plausible-sounding tool name that doesn't match anything in the discovered tool list, usually because the tool list wasn't actually passed into the chat call correctly.",
      mitigation:
        "Validate call.name against the tools array you fetched before calling client.callTool — if it's not found, return a clear error observation to the model ('no such tool, available tools are: ...') instead of letting the SDK throw an opaque error.",
    },
    {
      title: "Forgetting to close the client leaks the server process",
      description:
        "In a long-running app or during rapid local development, forgetting client.close() leaves orphaned server processes running, especially noticeable when a test suite spins up dozens of MCP servers.",
      mitigation:
        "Always close the client in a finally block, not just on the happy path, and during development periodically check for orphaned processes matching your server's command.",
    },
  ],
  useCases: [
    {
      title: "Adding one external capability to an existing chatbot",
      description:
        "A team with a working chatbot wants to add live weather, a calculator, or a company knowledge-base lookup — this is the entire integration, with no orchestration framework required.",
    },
    {
      title: "Learning MCP before adopting it in production",
      description:
        "Before committing to a multi-server, dynamically-discovered architecture, a developer builds this quickstart against one server to build an accurate mental model of what the protocol actually does.",
    },
  ],
};
