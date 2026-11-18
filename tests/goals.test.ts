import { describe, expect, it } from "vitest";
import {
  INITIAL_GOALS,
  addMilestone,
  goalStatus,
  removeMilestone,
  restoreGoal,
  restoreMilestone,
  stepSummary,
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
      milestones: [{ id: "id-1", text: "First step", done: false }],
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


describe("steps and undo helpers", () => {
  const goal: Goal = { id: "g", title: "Goal", archived: false, milestones: [{ id: "a", text: "A", done: true }, { id: "b", text: "B", done: false }] };
  const other: Goal = { id: "h", title: "Other", archived: false, milestones: [] };

  it("addMilestone appends a trimmed step and refuses blank text", () => {
    const list = [goal, other];
    expect(addMilestone(list, "g", "  C ", "c")[0].milestones.map((m) => m.text)).toEqual(["A", "B", "C"]);
    expect(addMilestone(list, "g", "   ", "c")).toBe(list);
    expect(addMilestone(list, "g", "C", "c")[1]).toBe(other);
  });

  it("removeMilestone and restoreMilestone put a step back before its old neighbour", () => {
    const without = removeMilestone([goal, other], "g", "a");
    expect(without[0].milestones.map((m) => m.id)).toEqual(["b"]);
    expect(restoreMilestone(without, "g", goal.milestones[0], "b")[0].milestones.map((m) => m.id)).toEqual(["a", "b"]);
    expect(restoreMilestone(without, "g", goal.milestones[0], "gone")[0].milestones.map((m) => m.id)).toEqual(["b", "a"]);
    expect(restoreMilestone([goal], "g", goal.milestones[0], null)[0].milestones).toHaveLength(2);
  });

  it("restoring the last step goes right after its old previous neighbour, before rows added since", () => {
    const without = removeMilestone([goal], "g", "b");
    const added = addMilestone(without, "g", "C", "c");
    expect(restoreMilestone(added, "g", goal.milestones[1], null, "a")[0].milestones.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(restoreMilestone(added, "g", goal.milestones[1], null, "gone")[0].milestones.map((m) => m.id)).toEqual(["a", "c", "b"]);
    expect(restoreGoal([goal], other, null, "g").map((g) => g.id)).toEqual(["g", "h"]);
  });

  it("a lone removed step comes back at its old index, before steps added since", () => {
    const lone: Goal = { id: "g", title: "G", archived: false, milestones: [{ id: "a", text: "A", done: false }] };
    const added = addMilestone(removeMilestone([lone], "g", "a"), "g", "C", "c");
    expect(restoreMilestone(added, "g", lone.milestones[0], null, null, 0)[0].milestones.map((m) => m.id)).toEqual(["a", "c"]);
    expect(restoreMilestone(added, "g", lone.milestones[0], null, null, 9)[0].milestones.map((m) => m.id)).toEqual(["c", "a"]);
    expect(restoreGoal([other], goal, null, null, 0).map((g) => g.id)).toEqual(["g", "h"]);
  });

  it("restoreGoal puts a goal back in place, at the end without a neighbour, and never twice", () => {
    expect(restoreGoal([other], goal, "h").map((g) => g.id)).toEqual(["g", "h"]);
    expect(restoreGoal([other], goal, null).map((g) => g.id)).toEqual(["h", "g"]);
    expect(restoreGoal([goal, other], goal, "h")).toHaveLength(2);
  });

  it("goalStatus and stepSummary", () => {
    expect(goalStatus(goal)).toBe("In progress");
    expect(goalStatus(other)).toBe("Not started");
    expect(goalStatus({ ...goal, milestones: [{ id: "a", text: "A", done: true }] })).toBe("Done");
    expect(goalStatus({ ...goal, milestones: [{ id: "a", text: "A", done: false }] })).toBe("Not started");
    expect(stepSummary(goal)).toBe("1 of 2 steps done");
    expect(stepSummary({ ...goal, milestones: [goal.milestones[0]] })).toBe("1 of 1 step done");
    expect(stepSummary(other)).toBe("No steps yet");
  });

  it("addGoal uses the first step when given", () => {
    let n = 0;
    const result = addGoal([], "Run", () => `id-${++n}`, " Shoes ");
    expect(result.goals[0].milestones[0].text).toBe("Shoes");
  });
});
