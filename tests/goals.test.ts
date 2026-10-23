import { describe, expect, it } from "vitest";
import {
  INITIAL_GOALS,
  addGoal,
  averageProgress,
  deleteGoal,
  parseGoals,
  progress,
  renameMilestone,
  serializeGoals,
  toggleArchived,
  toggleMilestone,
  visibleGoals,
  type Goal,
} from "@/lib/goals";

const goal = (id: string, done: boolean[], archived = false): Goal => ({
  id,
  title: `Goal ${id}`,
  archived,
  milestones: done.map((d, i) => ({ id: `${id}-${i}`, text: `Step ${i}`, done: d })),
});

describe("parseGoals", () => {
  it("falls back to the sample mission when nothing is stored", () => {
    expect(parseGoals(null)).toEqual(INITIAL_GOALS);
  });

  it("round-trips what serializeGoals wrote", () => {
    const goals = [goal("a", [true, false]), goal("b", [], true)];
    expect(parseGoals(serializeGoals(goals))).toEqual(goals);
  });

  // Bug: the page did JSON.parse(raw) as Goal[] and then goals.filter(...),
  // so a corrupt or foreign value in localStorage crashed the whole page.
  it.each(["not json", "null", "42", '{"goals":[]}', '"text"'])("survives corrupt storage %s", (raw) => {
    expect(parseGoals(raw)).toEqual(INITIAL_GOALS);
  });

  it("drops malformed entries and milestones but keeps valid ones", () => {
    const raw = JSON.stringify([
      goal("ok", [true]),
      { id: "x", title: 3, archived: false, milestones: [] },
      { id: "y", title: "No milestones array", archived: false },
      { ...goal("mixed", [false]), milestones: [{ id: "m", text: "fine", done: false }, { id: "bad" }] },
    ]);
    const parsed = parseGoals(raw);
    expect(parsed.map((g) => g.id)).toEqual(["ok", "mixed"]);
    expect(parsed[1].milestones).toEqual([{ id: "m", text: "fine", done: false }]);
  });
});

describe("progress", () => {
  it("is the rounded share of done milestones and 0 for an empty route", () => {
    expect(progress(goal("a", [true, false, false]))).toBe(33);
    expect(progress(goal("b", [true, true]))).toBe(100);
    expect(progress(goal("c", []))).toBe(0);
  });

  it("averages only active goals", () => {
    expect(averageProgress([goal("a", [true]), goal("b", [false]), goal("c", [true], true)])).toBe(50);
    expect(averageProgress([goal("c", [true], true)])).toBe(0);
    expect(averageProgress([])).toBe(0);
  });
});

describe("goal actions", () => {
  const goals = [goal("a", [false, true]), goal("b", [true], true)];

  it("adds a trimmed goal on top with a first waypoint", () => {
    let n = 0;
    const result = addGoal(goals, "  Run a marathon ", () => `id-${n++}`);
    expect(result.ok).toBe(true);
    expect(result.goals[0]).toEqual({
      id: "id-0",
      title: "Run a marathon",
      archived: false,
      milestones: [{ id: "id-1", text: "First waypoint", done: false }],
    });
    expect(result.goals).toHaveLength(3);
  });

  it("refuses a blank title without changing the list", () => {
    const result = addGoal(goals, "   ", () => "never");
    expect(result.ok).toBe(false);
    expect(result.goals).toBe(goals);
  });

  it("archives, restores and deletes by id", () => {
    expect(toggleArchived(goals, "a")[0].archived).toBe(true);
    expect(toggleArchived(goals, "b")[1].archived).toBe(false);
    expect(deleteGoal(goals, "a").map((g) => g.id)).toEqual(["b"]);
  });

  it("toggles and renames one milestone without touching the others", () => {
    const toggled = toggleMilestone(goals, "a", "a-0");
    expect(toggled[0].milestones.map((m) => m.done)).toEqual([true, true]);
    expect(toggled[1]).toBe(goals[1]);
    const renamed = renameMilestone(goals, "a", "a-1", "Renamed");
    expect(renamed[0].milestones[1].text).toBe("Renamed");
    expect(renamed[0].milestones[0].text).toBe("Step 0");
  });

  it("hides archived goals unless asked", () => {
    expect(visibleGoals(goals, false).map((g) => g.id)).toEqual(["a"]);
    expect(visibleGoals(goals, true).map((g) => g.id)).toEqual(["a", "b"]);
  });
});
