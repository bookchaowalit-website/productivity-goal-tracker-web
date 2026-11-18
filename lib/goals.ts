// Goal Tracker data and pure logic, shared by the page and the MCP route.

export type Milestone = { id: string; text: string; done: boolean };
export type Goal = { id: string; title: string; milestones: Milestone[]; archived: boolean };

export const STORAGE_KEY = "goal-tracker-v2";

export const INITIAL_GOALS: Goal[] = [
  {
    id: "mission-01",
    title: "Ship portfolio utilities",
    archived: false,
    milestones: [
      { id: "a", text: "Base64 + hash tools", done: true },
      { id: "b", text: "Mini-apps batch", done: false },
      { id: "c", text: "Deploy demos", done: false },
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMilestone(value: unknown): Milestone | null {
  if (!isRecord(value)) return null;
  const { id, text, done } = value;
  if (typeof id !== "string" || typeof text !== "string" || typeof done !== "boolean") return null;
  return { id, text, done };
}

function toGoal(value: unknown): Goal | null {
  if (!isRecord(value)) return null;
  const { id, title, archived, milestones } = value;
  if (typeof id !== "string" || typeof title !== "string" || typeof archived !== "boolean" || !Array.isArray(milestones)) {
    return null;
  }
  return { id, title, archived, milestones: milestones.map(toMilestone).filter((m): m is Milestone => m !== null) };
}

/** Keep only well-formed goals and milestones from untrusted data. */
export function sanitizeGoals(data: unknown[]): Goal[] {
  return data.map(toGoal).filter((g): g is Goal => g !== null);
}

/** Parse what the page stored. Anything missing or corrupt falls back to the sample mission. */
export function parseGoals(raw: string | null): Goal[] {
  if (raw === null) return INITIAL_GOALS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return INITIAL_GOALS;
  }
  if (!Array.isArray(data)) return INITIAL_GOALS;
  return sanitizeGoals(data);
}

export function serializeGoals(goals: Goal[]): string {
  return JSON.stringify(goals);
}

export function progress(goal: Goal): number {
  if (goal.milestones.length === 0) return 0;
  return Math.round((goal.milestones.filter((m) => m.done).length / goal.milestones.length) * 100);
}

export function activeGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => !g.archived);
}

export function averageProgress(goals: Goal[]): number {
  const active = activeGoals(goals);
  if (active.length === 0) return 0;
  return Math.round(active.reduce((sum, g) => sum + progress(g), 0) / active.length);
}

export function visibleGoals(goals: Goal[], showArchived: boolean): Goal[] {
  return showArchived ? goals : activeGoals(goals);
}

export function addGoal(goals: Goal[], title: string, makeId: () => string, firstStep = ""): { ok: boolean; goals: Goal[] } {
  const name = title.trim();
  if (!name) return { ok: false, goals };
  const goal: Goal = { id: makeId(), title: name, archived: false, milestones: [{ id: makeId(), text: firstStep.trim() || "First step", done: false }] };
  return { ok: true, goals: [goal, ...goals] };
}

/** Set a goal's archived state to the value asked for (not a toggle). Returns the same array when nothing changes. */
export function setArchived(goals: Goal[], goalId: string, archived: boolean): Goal[] {
  if (!goals.some((g) => g.id === goalId && g.archived !== archived)) return goals;
  return goals.map((g) => (g.id === goalId ? { ...g, archived } : g));
}

export function toggleArchived(goals: Goal[], goalId: string): Goal[] {
  return goals.map((g) => (g.id === goalId ? { ...g, archived: !g.archived } : g));
}

export function deleteGoal(goals: Goal[], goalId: string): Goal[] {
  return goals.filter((g) => g.id !== goalId);
}

function updateMilestone(goals: Goal[], goalId: string, milestoneId: string, change: (m: Milestone) => Milestone): Goal[] {
  return goals.map((g) =>
    g.id === goalId ? { ...g, milestones: g.milestones.map((m) => (m.id === milestoneId ? change(m) : m)) } : g,
  );
}

export function toggleMilestone(goals: Goal[], goalId: string, milestoneId: string): Goal[] {
  return updateMilestone(goals, goalId, milestoneId, (m) => ({ ...m, done: !m.done }));
}

export function renameMilestone(goals: Goal[], goalId: string, milestoneId: string, text: string): Goal[] {
  return updateMilestone(goals, goalId, milestoneId, (m) => ({ ...m, text }));
}

/** Add a step to the end of a goal. Blank text is refused (returns the same array). */
export function addMilestone(goals: Goal[], goalId: string, text: string, id: string): Goal[] {
  const name = text.trim();
  if (!name) return goals;
  return goals.map((g) => (g.id === goalId ? { ...g, milestones: [...g.milestones, { id, text: name, done: false }] } : g));
}

export function removeMilestone(goals: Goal[], goalId: string, milestoneId: string): Goal[] {
  return goals.map((g) => (g.id === goalId ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) } : g));
}

/**
 * Put a removed item back where it was: before its old next neighbour, else right after its old
 * previous neighbour (so a row added at the end meanwhile stays after it), else at its old index (a lone
 * row comes back before rows added since), else at the end.
 */
function insertBefore<T extends { id: string }>(items: T[], item: T, beforeId: string | null, afterId: string | null = null, index?: number): T[] {
  if (items.some((entry) => entry.id === item.id)) return items;
  const before = beforeId ? items.findIndex((entry) => entry.id === beforeId) : -1;
  const after = before < 0 && afterId ? items.findIndex((entry) => entry.id === afterId) : -1;
  const fallback = index === undefined ? items.length : Math.min(Math.max(index, 0), items.length);
  const at = before >= 0 ? before : after >= 0 ? after + 1 : fallback;
  return [...items.slice(0, at), item, ...items.slice(at)];
}

export function restoreGoal(goals: Goal[], goal: Goal, beforeId: string | null, afterId: string | null = null, index?: number): Goal[] {
  return insertBefore(goals, goal, beforeId, afterId, index);
}

export function restoreMilestone(goals: Goal[], goalId: string, milestone: Milestone, beforeId: string | null, afterId: string | null = null, index?: number): Goal[] {
  return goals.map((g) => (g.id === goalId ? { ...g, milestones: insertBefore(g.milestones, milestone, beforeId, afterId, index) } : g));
}

export type GoalStatus = "Not started" | "In progress" | "Done";

/** Done needs at least one step, all of them checked. */
export function goalStatus(goal: Goal): GoalStatus {
  const done = goal.milestones.filter((m) => m.done).length;
  if (goal.milestones.length > 0 && done === goal.milestones.length) return "Done";
  return done === 0 ? "Not started" : "In progress";
}

export function stepSummary(goal: Goal): string {
  const total = goal.milestones.length;
  if (total === 0) return "No steps yet";
  const done = goal.milestones.filter((m) => m.done).length;
  return `${done} of ${total} ${total === 1 ? "step" : "steps"} done`;
}
