import { NextResponse } from "next/server";
import { INITIAL_GOALS, averageProgress, progress, sanitizeGoals } from "@/lib/goals";

// Stateless JSON-RPC MCP endpoint. Goals live in the visitor's browser (localStorage), so the server
// cannot read them: it serves the sample mission and scores goals the caller sends, with the page's own logic.

type RpcRequest = { id?: number | string | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const TOOLS = [
  { name: "get_sample_goals", description: "The sample mission a new browser starts with", inputSchema: { type: "object", properties: {} } },
  {
    name: "compute_progress",
    description: "Progress per goal (share of done milestones) and the average over active goals",
    inputSchema: {
      type: "object",
      properties: {
        goals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              archived: { type: "boolean" },
              milestones: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, done: { type: "boolean" } } } },
            },
          },
        },
      },
      required: ["goals"],
    },
  },
];

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

function callTool(name: string | undefined, args: Record<string, unknown> = {}) {
  switch (name) {
    case "get_sample_goals":
      return { goals: INITIAL_GOALS };
    case "compute_progress": {
      if (!Array.isArray(args.goals)) throw new RpcError(-32602, "goals must be an array");
      const goals = sanitizeGoals(args.goals);
      return {
        goals: goals.map((g) => ({ id: g.id, title: g.title, archived: g.archived, progress: progress(g) })),
        averageActiveProgress: averageProgress(goals),
      };
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${String(name)}`);
  }
}

export async function POST(request: Request) {
  let id: RpcRequest["id"] = null;
  try {
    const body = (await request.json()) as RpcRequest;
    id = body.id ?? null;
    let result: unknown;
    switch (body.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Goal Tracker", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = callTool(body.params?.name, body.params?.arguments);
        break;
      default:
        throw new RpcError(-32601, `Unknown method: ${String(body.method)}`);
    }
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32700;
    const message = error instanceof RpcError ? error.message : "Parse error";
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 400 });
  }
}
