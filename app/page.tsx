"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill, PlusIcon, type Tone } from "@/components/app-shell";
import {
  STORAGE_KEY, activeGoals, addGoal as addGoalTo, addMilestone, averageProgress, deleteGoal, goalStatus, parseGoals, progress,
  removeMilestone, renameMilestone, restoreGoal, restoreMilestone, serializeGoals, stepSummary, toggleArchived, toggleMilestone,
  type Goal, type GoalStatus, type Milestone,
} from "@/lib/goals";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

const store = createLocalStore(STORAGE_KEY, parseGoals, serializeGoals);
const TONE: Record<GoalStatus, Tone> = { "Not started": "grey", "In progress": "amber", Done: "green" };
type View = "Active" | "Archived";
type Removed =
  | { kind: "goal"; goal: Goal; beforeId: string | null }
  | { kind: "step"; goalId: string; step: Milestone; beforeId: string | null };
/** Every removal still inside the Undo window: one Undo puts them all back where they were. */
type RemovedBatch = { items: Removed[]; viaKeyboard: boolean };
const removedLabel = (items: Removed[]) => {
  if (items.length > 1) return `Removed ${items.length} items`;
  const [item] = items;
  return item.kind === "goal" ? `Deleted “${item.goal.title}”` : `Removed “${item.step.text}”`;
};

// randomUUID only exists in secure contexts (HTTPS/localhost) and newer browsers.
function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
);

export default function Home() {
  const goals = useLocalStore(store);
  const setGoals = store.set;
  const [view, setView] = useState<View>("Active");
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [firstStep, setFirstStep] = useState("");
  const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
  const [removed, setRemovedState] = useState<RemovedBatch | null>(null);
  // The latest batch, so two removals before a re-render still both land in it.
  const removedRef = useRef<RemovedBatch | null>(null);
  const setRemoved = (batch: RemovedBatch | null) => { removedRef.current = batch; setRemovedState(batch); };
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const wasComposing = useRef(false);

  const active = activeGoals(goals);
  const archived = goals.filter((goal) => goal.archived);
  const visible = view === "Active" ? active : archived;
  const average = averageProgress(goals);

  useEffect(() => {
    if (composing) titleRef.current?.focus();
    else if (wasComposing.current) newRef.current?.focus();
    wasComposing.current = composing;
  }, [composing]);
  useEffect(() => { if (removed?.viaKeyboard) undoRef.current?.focus(); }, [removed]);
  // The toast closes 6 s after the latest removal (each removal restarts it), but never while it holds focus.
  useEffect(() => {
    if (!removed || toastFocused) return;
    const timer = window.setTimeout(() => { removedRef.current = null; setRemovedState(null); }, 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused]);

  function closeComposer() {
    setComposing(false);
    setTitle("");
    setFirstStep("");
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = addGoalTo(goals, title, createId, firstStep);
    if (!result.ok) return;
    setGoals(result.goals);
    setView("Active");
    setAnnouncement(`Added “${title.trim()}”.`);
    closeComposer();
  }
  function archive(goal: Goal) {
    setGoals((items) => toggleArchived(items, goal.id));
    setAnnouncement(goal.archived ? `Moved “${goal.title}” back to Active.` : `Archived “${goal.title}”. It is under Archived.`);
    // The card leaves this list, so its button goes with it: move focus to New goal, or to the
    // composer when it is open (New goal is hidden then).
    (newRef.current ?? titleRef.current)?.focus();
  }
  // Removals read the item and its neighbour from the stored list inside the same update (not from
  // this render), then join the batch that one Undo restores.
  function addToBatch(entry: Removed | undefined, viaKeyboard: boolean) {
    if (!entry) return;
    const items = [...(removedRef.current?.items ?? []), entry];
    setRemoved({ items, viaKeyboard });
    setAnnouncement(`${removedLabel(items)}. Undo is available for a few seconds.`);
  }
  function removeGoal(goal: Goal, viaKeyboard: boolean) {
    let entry: Removed | undefined;
    setGoals((items) => {
      const index = items.findIndex((item) => item.id === goal.id);
      if (index < 0) return items;
      entry = { kind: "goal", goal: items[index], beforeId: items[index + 1]?.id ?? null };
      return deleteGoal(items, goal.id);
    });
    addToBatch(entry, viaKeyboard);
  }
  function removeStep(goal: Goal, step: Milestone, viaKeyboard: boolean) {
    let entry: Removed | undefined;
    setGoals((items) => {
      const steps = items.find((item) => item.id === goal.id)?.milestones ?? [];
      const index = steps.findIndex((item) => item.id === step.id);
      if (index < 0) return items;
      entry = { kind: "step", goalId: goal.id, step: steps[index], beforeId: steps[index + 1]?.id ?? null };
      return removeMilestone(items, goal.id, step.id);
    });
    addToBatch(entry, viaKeyboard);
  }
  function addStep(event: FormEvent<HTMLFormElement>, goal: Goal) {
    event.preventDefault();
    const text = stepDrafts[goal.id] ?? "";
    if (!text.trim()) return;
    setGoals((items) => addMilestone(items, goal.id, text, createId()));
    setStepDrafts((drafts) => ({ ...drafts, [goal.id]: "" }));
    setAnnouncement(`Added step “${text.trim()}” to “${goal.title}”.`);
    // Add disappears once the field is empty, so keep focus in the field for the next step.
    event.currentTarget.querySelector("input")?.focus();
  }
  function closeToast() {
    setRemoved(null);
    setToastFocused(false);
    (newRef.current ?? titleRef.current)?.focus();
  }
  function undo() {
    const batch = removedRef.current?.items;
    if (!batch?.length) return;
    // Latest removal first: a goal deleted after one of its steps comes back before that step does.
    setGoals((items) => batch.reduceRight((list, entry) => (entry.kind === "goal"
      ? restoreGoal(list, entry.goal, entry.beforeId)
      : restoreMilestone(list, entry.goalId, entry.step, entry.beforeId)), items));
    const [only] = batch;
    setAnnouncement(batch.length > 1 ? `Restored ${batch.length} items.` : only.kind === "goal" ? `Restored “${only.goal.title}”.` : `Restored step “${only.step.text}”.`);
    closeToast();
  }

  const heading = view === "Active" ? "Active goals" : "Archived";
  const summary = view === "Active"
    ? `${active.length} ${active.length === 1 ? "goal" : "goals"}${active.length ? ` · ${average}% average progress` : ""}`
    : `${archived.length} archived`;

  return (
    <div className="as">
      <a className="as-skip" href="#main">Skip to content</a>
      <AppTop name="Goals" tagline="Break a goal into steps and tick them off" />

      <div className="as-body">
        <aside className="as-side" aria-label="Lists">
          <h2>Lists</h2>
          <ul className="as-lists">
            <ListButton label="Active" count={active.length} current={view === "Active"} onSelect={() => setView("Active")} />
            <ListButton label="Archived" count={archived.length} current={view === "Archived"} onSelect={() => setView("Archived")} />
          </ul>
        </aside>

        <main id="main" className="as-main">
          <div className="as-head">
            <div>
              <h1>{heading}</h1>
              <p aria-live="polite">{summary}</p>
            </div>
            <div className="as-tools">
              {composing ? null : <button ref={newRef} type="button" className="as-button" onClick={() => setComposing(true)}><PlusIcon />New goal</button>}
            </div>
          </div>

          {composing ? (
            <form className="as-composer" onSubmit={add} aria-label="New goal">
              <label className="as-field">Goal
                <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you want to finish?" autoComplete="off" />
              </label>
              <label className="as-field">First step
                <input value={firstStep} onChange={(event) => setFirstStep(event.target.value)} placeholder="The smallest thing you can do next" autoComplete="off" />
              </label>
              <div className="as-composer-foot">
                <span className="as-hint">You can add more steps after.</span>
                <div className="as-composer-actions">
                  <button type="button" className="as-plain" onClick={closeComposer}>Cancel</button>
                  <button type="submit" className="as-button" disabled={!title.trim()}>Add</button>
                </div>
              </div>
            </form>
          ) : null}

          {visible.length ? (
            <div className="as-goals">
              {visible.map((goal) => {
                const pct = progress(goal);
                const status = goalStatus(goal);
                const draft = stepDrafts[goal.id] ?? "";
                return (
                  <section className="as-goal" key={goal.id} aria-labelledby={`goal-${goal.id}`}>
                    <div className="as-goal-head">
                      <div>
                        <h2 id={`goal-${goal.id}`}>{goal.title}</h2>
                        <p>{stepSummary(goal)}</p>
                      </div>
                      <Pill tone={TONE[status]}>{status}</Pill>
                    </div>
                    <div className="as-progress" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-done={status === "Done" ? "true" : undefined}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    {goal.milestones.length ? (
                      <ul className="as-steps" aria-label={`Steps for ${goal.title}`}>
                        {goal.milestones.map((step, index) => (
                          <li className="as-row as-row-check" key={step.id} data-done={step.done ? "true" : undefined}>
                            <label className="as-check">
                              <input
                                type="checkbox"
                                checked={step.done}
                                aria-label={`Done: ${step.text}`}
                                onChange={() => {
                                  setGoals((items) => toggleMilestone(items, goal.id, step.id));
                                  setAnnouncement(`${step.done ? "Reopened" : "Done"}: ${step.text}`);
                                }}
                              />
                              <span aria-hidden="true" />
                            </label>
                            <input
                              className="as-step-input"
                              aria-label={`Step ${index + 1} of ${goal.title}`}
                              value={step.text}
                              onChange={(event) => setGoals((items) => renameMilestone(items, goal.id, step.id, event.target.value))}
                              onBlur={(event) => { if (!event.target.value.trim()) setGoals((items) => renameMilestone(items, goal.id, step.id, "Untitled step")); }}
                            />
                            <button type="button" className="as-plain as-icon" aria-label={`Remove step ${step.text}`} onClick={(event) => removeStep(goal, step, event.detail === 0)}><XIcon /></button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <form className="as-add-step" onSubmit={(event) => addStep(event, goal)}>
                      <span className="as-add-icon" aria-hidden="true"><PlusIcon /></span>
                      <label className="as-sr" htmlFor={`add-${goal.id}`}>Add a step to {goal.title}</label>
                      <input id={`add-${goal.id}`} value={draft} onChange={(event) => setStepDrafts((drafts) => ({ ...drafts, [goal.id]: event.target.value }))} placeholder="Add a step" autoComplete="off" />
                      {draft.trim() ? <button type="submit" className="as-plain">Add</button> : null}
                    </form>
                    <div className="as-goal-foot">
                      <button type="button" className="as-plain" aria-label={`${goal.archived ? "Restore" : "Archive"} ${goal.title}`} onClick={() => archive(goal)}>{goal.archived ? "Restore" : "Archive"}</button>
                      <button type="button" className="as-plain as-danger" aria-label={`Delete ${goal.title}`} onClick={(event) => removeGoal(goal, event.detail === 0)}>Delete</button>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="as-list as-empty">
              {goals.length === 0
                ? <><strong>No goals yet</strong>Press New goal and name the first step.</>
                : view === "Active"
                  ? <><strong>Nothing active</strong>Every goal is archived. Press New goal to start another.</>
                  : <><strong>Nothing archived</strong>Archive a goal when you are done with it.</>}
            </div>
          )}

          <p className="as-note">Saved in this browser only. No account, no sync.</p>
        </main>
      </div>

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {removed ? (
        <div
          className="as-toast"
          role="group"
          aria-label="Undo"
          onFocus={() => setToastFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") closeToast(); }}
        >
          <span>{removedLabel(removed.items)}</span>
          <button ref={undoRef} type="button" className="as-plain" onClick={undo} aria-label={removed.items.length > 1 ? `Undo remove of ${removed.items.length} items` : undefined}>Undo</button>
        </div>
      ) : null}

      <AppFoot source="https://github.com/bookchaowalit-website/productivity-goal-tracker-web" />
    </div>
  );
}
