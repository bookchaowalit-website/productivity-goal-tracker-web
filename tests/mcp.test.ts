import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { INITIAL_GOALS } from "@/lib/goals";

function rpc(body: unknown) {
  return POST(new Request("http://localhost/api/mcp", { method: "POST", body: JSON.stringify(body) }));
}

describe("MCP route", () => {
  it("echoes the JSON-RPC request id, including 0", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 7, method: "tools/list" })).json()).id).toBe(7);
    expect((await (await rpc({ jsonrpc: "2.0", id: 0, method: "initialize" })).json()).id).toBe(0);
  });

  it("lists only the tools it really implements", async () => {
    const { result } = await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(result.tools.map((t: { name: string }) => t.name)).toEqual(["get_sample_goals", "compute_progress"]);
  });

  it("get_sample_goals returns the sample mission the page starts with", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sample_goals" } });
    expect((await res.json()).result.goals).toEqual(INITIAL_GOALS);
  });

  it("compute_progress scores the goals it is given and skips archived ones in the average", async () => {
    const goals = [
      { id: "g1", title: "One", archived: false, milestones: [{ id: "m1", text: "a", done: true }, { id: "m2", text: "b", done: false }] },
      { id: "g2", title: "Two", archived: true, milestones: [{ id: "m3", text: "c", done: true }] },
    ];
    const res = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "compute_progress", arguments: { goals } } });
    const { result } = await res.json();
    expect(result.goals).toEqual([
      { id: "g1", title: "One", archived: false, progress: 50 },
      { id: "g2", title: "Two", archived: true, progress: 100 },
    ]);
    expect(result.averageActiveProgress).toBe(50);
  });

  it("compute_progress rejects a non-array goals argument", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "compute_progress", arguments: { goals: "x" } } });
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(body.id).toBe(4);
  });

  it("rejects an unknown tool instead of pretending to call it", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "delete_all" } });
    expect((await res.json()).error.code).toBe(-32602);
  });

  it("rejects an unknown method and bad JSON", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 6, method: "nope" })).json()).error.code).toBe(-32601);
    const bad = await POST(new Request("http://localhost/api/mcp", { method: "POST", body: "{" }));
    const body = await bad.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });
});
