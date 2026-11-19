"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill, PlusIcon, type Tone } from "@/components/app-shell";
import {
  STORAGE_KEY, activeGoals, addGoal as addGoalTo, addMilestone, averageProgress, deleteGoal, goalStatus, parseGoals, progress,
  removeMilestone, renameMilestone, restoreGoal, restoreMilestone, SAMPLE_GOAL_IDS, serializeGoals, setArchived, stepSummary, toggleMilestone,
  type Goal, type GoalStatus, type Milestone,
} from "@/lib/goals";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

const store = createLocalStore(STORAGE_KEY, parseGoals, serializeGoals);
const TONE: Record<GoalStatus, Tone> = { "Not started": "grey", "In progress": "amber", Done: "green" };
type View = "Active" | "Archived";
type Removed =
  | { kind: "goal"; goal: Goal; beforeId: string | null; afterId: string | null; index: number }
  | { kind: "step"; goalId: string; step: Milestone; beforeId: string | null; afterId: string | null; index: number };
/** Every removal still inside the Undo window: one Undo puts them all back where they were. */
type RemovedBatch = { items: Removed[]; viaKeyboard: boolean; waiting?: boolean };
const removedLabel = (items: Removed[]) => {
  if (items.length > 1) return `Removed ${items.length} items`;
  const [item] = items;
  return item.kind === "goal" ? `Deleted “${item.goal.title}”` : `Removed “${item.step.text}”`;
};

/** Shown in the toast when Undo had to keep steps back because their goal is gone (deleted in another tab). */
// The step name sits in its own span that truncates to one line, so a long name cannot push Undo off a small screen.
const waitingLabel = (items: Removed[]) => (items.length === 1 && items[0].kind === "step"
  ? <><span className="as-toast-name">“{items[0].step.text}”</span>Its goal is gone. Restore the goal, then press Undo.</>
  : <>{items.length} steps wait for their goal. Restore it, then press Undo.</>);

const goalCardId = (goalId: string) => `goal-card-${goalId}`;
const stepFieldId = (goalId: string, stepId: string) => `step-${goalId}-${stepId}`;

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
  // Goal ids come from stored data, so an id like "constructor" must not read Object.prototype.
  const draftFor = (goalId: string) => (Object.hasOwn(stepDrafts, goalId) ? stepDrafts[goalId] : "");
  const [removed, setRemovedState] = useState<RemovedBatch | null>(null);
  // The latest batch, so two removals before a re-render still both land in it.
  const removedRef = useRef<RemovedBatch | null>(null);
  const setRemoved = (batch: RemovedBatch | null) => { removedRef.current = batch; setRemovedState(batch); };
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // A visible message for an action that could not be saved (the live region below is for screen readers only).
  const [notice, setNotice] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  // The id of the control to focus once Undo's restore has rendered (the restored step, or the restored goal card).
  const focusAfterUndo = useRef<string | null>(null);
  // Step titles this tab typed, by step id: leaving a field only fills in "Untitled step" for an edit made here,
  // and only while the saved title is still what this tab wrote (another tab may be mid-edit on the same step).
  const typedTitles = useRef(new Map<string, string>());
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
  // Runs after every render, so it fires on the render that shows the restored item.
  useEffect(() => {
    const id = focusAfterUndo.current;
    if (!id) return;
    focusAfterUndo.current = null;
    // Not on screen (e.g. restored into the other list): fall back to New goal, or the composer when it is open.
    (document.getElementById(id) ?? newRef.current ?? titleRef.current)?.focus();
  });
  // The toast closes 6 s after the latest removal (each removal restarts it), but never while it holds focus.
  useEffect(() => {
    if (!removed || toastFocused) return;
    const timer = window.setTimeout(() => { removedRef.current = null; setRemovedState(null); }, 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused]);
  // While the toast shows, reserve its height (plus its 24px offset and a gap) at the bottom of the page and in
  // scroll-padding, so a control focused behind it (Shift+Tab from Undo) scrolls clear instead of staying hidden.
  const toastShown = removed !== null;
  useLayoutEffect(() => {
    const toast = toastRef.current;
    if (!toastShown || !toast) return;
    const rootStyle = document.documentElement.style;
    const reserve = () => rootStyle.setProperty("--as-toast-space", `${toast.offsetHeight + 32}px`);
    reserve();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(reserve) : null;
    observer?.observe(toast);
    return () => { observer?.disconnect(); rootStyle.removeProperty("--as-toast-space"); };
  }, [toastShown]);

  function closeComposer() {
    setComposing(false);
    setTitle("");
    setFirstStep("");
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Build on the store's latest value inside one update, not this render's list: another tab may have saved since,
    // and writing a stale list would drop its changes.
    let added = false;
    setGoals((items) => {
      const result = addGoalTo(items, title, createId, firstStep);
      added = result.ok;
      return result.goals;
    });
    if (!added) return;
    setView("Active");
    setAnnouncement(`Added “${title.trim()}”.`);
    closeComposer();
  }
  function archive(goal: Goal) {
    // The button names the state to reach (Archive or Restore): set it, never toggle what another tab may have saved.
    const archived = !goal.archived;
    // Announce the move only when the goal is still in the latest data (another tab may have deleted it).
    let found = false;
    setGoals((items) => {
      found = items.some((item) => item.id === goal.id);
      return setArchived(items, goal.id, archived);
    });
    if (!found) setAnnouncement(`“${goal.title}” is no longer here. It was removed in another tab.`);
    else setAnnouncement(archived ? `Archived “${goal.title}”. It is under Archived.` : `Moved “${goal.title}” back to Active.`);
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
      entry = { kind: "goal", goal: items[index], beforeId: items[index + 1]?.id ?? null, afterId: items[index - 1]?.id ?? null, index };
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
      entry = { kind: "step", goalId: goal.id, step: steps[index], beforeId: steps[index + 1]?.id ?? null, afterId: steps[index - 1]?.id ?? null, index };
      return removeMilestone(items, goal.id, step.id);
    });
    addToBatch(entry, viaKeyboard);
  }
  function addStep(event: FormEvent<HTMLFormElement>, goal: Goal) {
    event.preventDefault();
    const text = draftFor(goal.id);
    if (!text.trim()) return;
    // Add only when the goal is still in the latest data (another tab may have deleted it): otherwise keep the draft,
    // so it is still there if the goal comes back, and say what happened.
    let added = false;
    setGoals((items) => {
      added = items.some((item) => item.id === goal.id);
      return added ? addMilestone(items, goal.id, text, createId()) : items;
    });
    if (!added) {
      // Shown on the page too (the card is about to disappear), not only in the screen-reader live region.
      const message = `Could not add “${text.trim()}”: “${goal.title}” is no longer here. Your step is kept.`;
      setNotice(message);
      setAnnouncement(message);
      return;
    }
    setNotice("");
    setStepDrafts((drafts) => ({ ...drafts, [goal.id]: "" }));
    setAnnouncement(`Added step “${text.trim()}” to “${goal.title}”.`);
    // Add disappears once the field is empty, so keep focus in the field for the next step.
    event.currentTarget.querySelector("input")?.focus();
  }
  function closeToast(focusId?: string) {
    setRemoved(null);
    setToastFocused(false);
    if (focusId) focusAfterUndo.current = focusId;
    else (newRef.current ?? titleRef.current)?.focus();
  }
  function undo() {
    const batch = removedRef.current?.items;
    if (!batch?.length) return;
    // Latest removal first: a goal deleted after one of its steps comes back before that step does. A step whose
    // goal is gone (deleted in another tab) stays pending, so Undo can still bring it back once the goal returns.
    const restored: Removed[] = [];
    const pending: Removed[] = [];
    const before = store.getSnapshot();
    const saved = setGoals((items) => {
      restored.length = 0;
      pending.length = 0;
      return batch.reduceRight((list, entry) => {
        if (entry.kind === "goal") {
          restored.unshift(entry);
          return restoreGoal(list, entry.goal, entry.beforeId, entry.afterId, entry.index);
        }
        if (!list.some((goal) => goal.id === entry.goalId)) {
          pending.unshift(entry);
          return list;
        }
        restored.unshift(entry);
        return restoreMilestone(list, entry.goalId, entry.step, entry.beforeId, entry.afterId, entry.index);
      }, items);
    });
    if (!saved) {
      // The browser would not save the restore (storage full): put the page back as it was, so a reload cannot
      // lose what looked restored, and keep the same Undo for another try.
      store.set(before);
      const message = "Could not save the restore: this browser’s storage is full. Nothing was restored; free some space and press Undo again.";
      setNotice(message);
      setAnnouncement(message);
      setRemoved({ items: batch, viaKeyboard: true, waiting: removedRef.current?.waiting });
      return;
    }
    const [only] = restored;
    const done = !restored.length ? "" : restored.length > 1 ? `Restored ${restored.length} items. ` : only.kind === "goal" ? `Restored “${only.goal.title}”. ` : `Restored step “${only.step.text}”. `;
    if (!pending.length) {
      setAnnouncement(done.trim());
      // Focus what came back from the latest removal: its step field, or its goal card.
      const latest = restored[restored.length - 1];
      closeToast(latest.kind === "step" ? stepFieldId(latest.goalId, latest.step.id) : goalCardId(latest.goal.id));
      return;
    }
    // Keep the toast for what could not go back yet, and keep focus on its Undo button.
    setRemoved({ items: pending, viaKeyboard: true, waiting: true });
    const waiting = pending.length === 1 ? "1 step is" : `${pending.length} steps are`;
    setAnnouncement(`${done}${waiting} waiting for a goal that is no longer here. Restore the goal, then press Undo again.`);
    undoRef.current?.focus();
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

          {notice ? (
            <div className="as-notice">
              <p>{notice}</p>
              <button type="button" className="as-plain" onClick={() => setNotice("")}>Dismiss</button>
            </div>
          ) : null}

          {visible.length ? (
            <div className="as-goals">
              {visible.map((goal) => {
                const pct = progress(goal);
                const status = goalStatus(goal);
                const draft = draftFor(goal.id);
                return (
                  <section className="as-goal" key={goal.id} id={goalCardId(goal.id)} tabIndex={-1} aria-labelledby={`goal-${goal.id}`}>
                    <div className="as-goal-head">
                      <div>
                        <h2 id={`goal-${goal.id}`}>{goal.title}</h2>
                        <p>{stepSummary(goal)}</p>
                      </div>
                      <div className="as-goal-pills">
                        {SAMPLE_GOAL_IDS.has(goal.id) ? <Pill tone="grey">Sample</Pill> : null}
                        <Pill tone={TONE[status]}>{status}</Pill>
                      </div>
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
                              id={stepFieldId(goal.id, step.id)}
                              aria-label={`Step ${index + 1} of ${goal.title}`}
                              value={step.text}
                              onChange={(event) => {
                                typedTitles.current.set(step.id, event.target.value);
                                setGoals((items) => renameMilestone(items, goal.id, step.id, event.target.value));
                              }}
                              onBlur={() => {
                                const typed = typedTitles.current.get(step.id);
                                typedTitles.current.delete(step.id);
                                // Not edited in this tab since focus: nothing to fix up, and nothing to write.
                                if (typed === undefined) return;
                                setGoals((items) => {
                                  const latest = items.find((item) => item.id === goal.id)?.milestones.find((item) => item.id === step.id);
                                  return latest && latest.text === typed && !typed.trim() ? renameMilestone(items, goal.id, step.id, "Untitled step") : items;
                                });
                              }}
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
                      {/* Always visible (a phone user may not know Enter adds), disabled until there is text. */}
                      <button type="submit" className="as-plain" disabled={!draft.trim()}>Add</button>
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
                ? <><strong>No goals yet</strong>Name a goal and its first step.</>
                : view === "Active"
                  ? <><strong>Nothing active</strong>Every goal is archived. Start another one.</>
                  : <><strong>Nothing archived</strong>Archive a goal when you are done with it.</>}
              {(view === "Active" || goals.length === 0) && !composing
                ? <div className="as-empty-action"><button type="button" className="as-button" onClick={() => setComposing(true)}><PlusIcon />New goal</button></div>
                : null}
            </div>
          )}

          <p className="as-note">Saved in this browser only. No account, no sync.</p>
        </main>
      </div>

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {removed ? (
        <div
          ref={toastRef}
          className="as-toast"
          data-waiting={removed.waiting ? "true" : undefined}
          role="group"
          aria-label="Undo"
          onFocus={() => setToastFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") closeToast(); }}
        >
          <span>{removed.waiting ? waitingLabel(removed.items) : removedLabel(removed.items)}</span>
          <button ref={undoRef} type="button" className="as-plain" onClick={undo} aria-label={removed.items.length > 1 ? `Undo remove of ${removed.items.length} items` : undefined}>Undo</button>
        </div>
      ) : null}

      <AppFoot source="https://github.com/bookchaowalit-website/productivity-goal-tracker-web" />
    </div>
  );
}
