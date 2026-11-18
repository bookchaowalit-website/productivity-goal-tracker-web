// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { STORAGE_KEY } from "@/lib/goals";

// Mounted tests for goals on the App shell: composer, steps, archive, delete, undo and focus.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const SAMPLE = "Ship portfolio utilities";
const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = host) => scope.querySelector(selector) as T | null;
const button = (text: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const goalTitles = () => [...host.querySelectorAll(".as-goal h2")].map((h) => h.textContent);
const card = (title: string) => [...host.querySelectorAll(".as-goal")].find((c) => c.querySelector("h2")?.textContent === title) as HTMLElement;
const steps = (title: string) => [...card(title).querySelectorAll<HTMLInputElement>(".as-step-input")].map((i) => i.value);
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const press = (el: Element, detail = 0) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = (form: HTMLFormElement) => act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Home />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("composer", () => {
  it("opens focused, keeps Add disabled without a title, adds on top with its first step and returns focus", () => {
    press(button("New goal"));
    const [goal, first] = host.querySelectorAll<HTMLInputElement>(".as-composer input");
    expect(document.activeElement).toBe(goal);
    expect(button("Add", $(".as-composer")!).disabled).toBe(true);
    type(goal, "Run a 10k");
    type(first, "Buy shoes");
    press(button("Add", $(".as-composer")!));
    expect(goalTitles()[0]).toBe("Run a 10k");
    expect(steps("Run a 10k")).toEqual(["Buy shoes"]);
    expect(card("Run a 10k").textContent).toContain("Not started");
    expect(document.activeElement?.textContent).toContain("New goal");
    expect(saved()[0]).toMatchObject({ title: "Run a 10k", archived: false });
  });

  it("a blank first step becomes “First step”; adding from Archived switches to Active; Cancel adds nothing", () => {
    press(button("Archived", $(".as-side")!));
    press(button("New goal"));
    type($<HTMLInputElement>(".as-composer input")!, "Learn Thai script");
    press(button("Add", $(".as-composer")!));
    expect($("h1")!.textContent).toBe("Active goals");
    expect(steps("Learn Thai script")).toEqual(["First step"]);
    press(button("New goal"));
    type($<HTMLInputElement>(".as-composer input")!, "Never added");
    press(button("Cancel"));
    expect(goalTitles()).not.toContain("Never added");
    expect(document.activeElement?.textContent).toContain("New goal");
  });

  it("still adds when crypto.randomUUID is missing (plain HTTP, older browsers)", () => {
    vi.stubGlobal("crypto", {});
    press(button("New goal"));
    type($<HTMLInputElement>(".as-composer input")!, "No secure context");
    press(button("Add", $(".as-composer")!));
    expect(saved()[0].id).toMatch(/^goal-\d+-[a-z0-9]+$/);
  });
});

describe("steps", () => {
  it("ticking a step updates the summary, pill and progress; all done turns the goal Done", () => {
    const sample = card(SAMPLE);
    act(() => { $<HTMLInputElement>('[aria-label="Done: Mini-apps batch"]', sample)!.click(); });
    expect(sample.textContent).toContain("2 of 3 steps done");
    expect($('[role="progressbar"]', sample)!.getAttribute("aria-valuenow")).toBe("67");
    act(() => { $<HTMLInputElement>('[aria-label="Done: Deploy demos"]', sample)!.click(); });
    expect(sample.textContent).toContain("Done");
    expect($('[role="progressbar"]', sample)!.getAttribute("data-done")).toBe("true");
    act(() => { $<HTMLInputElement>('[aria-label="Done: Deploy demos"]', sample)!.click(); });
    expect(sample.textContent).toContain("In progress");
  });

  it("adds a step from the Add a step row, renames a step, and a blank name becomes “Untitled step”", () => {
    const input = $<HTMLInputElement>(".as-add-step input", card(SAMPLE))!;
    expect(button("Add", $(".as-add-step", card(SAMPLE))!)).toBeUndefined();
    type(input, "Write the README");
    act(() => { button("Add", $(".as-add-step", card(SAMPLE))!).focus(); });
    press(button("Add", $(".as-add-step", card(SAMPLE))!));
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos", "Write the README"]);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect(steps(SAMPLE)).toHaveLength(4);
    const second = $<HTMLInputElement>(`[aria-label="Step 2 of ${SAMPLE}"]`)!;
    type(second, "Mini-apps, batch two");
    expect(steps(SAMPLE)[1]).toBe("Mini-apps, batch two");
    type(second, "  ");
    act(() => { second.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(steps(SAMPLE)[1]).toBe("Untitled step");
  });

  it("removing a step can be undone in place", () => {
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Deploy demos"]);
    expect(document.activeElement?.textContent).toBe("Undo");
    expect($(".as-toast")!.textContent).toContain("Removed “Mini-apps batch”");
    press(button("Undo"));
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]);
    // Focus goes back to the restored step's field, not to the top of the page.
    expect(document.activeElement).toBe($(`[aria-label="Step 2 of ${SAMPLE}"]`));
    for (const text of ["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]) press($(`[aria-label="Remove step ${text}"]`)!, 1);
    expect(card(SAMPLE).textContent).toContain("No steps yet");
  });
});

describe("undo order and stored ids", () => {
  it("removing the last step, then adding one, then Undo puts the step back in its old place", () => {
    press($('[aria-label="Remove step Deploy demos"]')!, 1);
    const input = $<HTMLInputElement>(".as-add-step input", card(SAMPLE))!;
    type(input, "Write the README");
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Write the README"]);
    press(button("Undo"));
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos", "Write the README"]);
  });

  it("removing a goal's only step, adding one, then Undo puts the step back first", () => {
    for (const text of ["Base64 + hash tools", "Mini-apps batch"]) press($(`[aria-label="Remove step ${text}"]`)!, 1);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    press($('[aria-label="Remove step Deploy demos"]')!, 1);
    type($<HTMLInputElement>(".as-add-step input", card(SAMPLE))!, "Publish");
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    press(button("Undo"));
    expect(steps(SAMPLE)).toEqual(["Deploy demos", "Publish"]);
  });

  it("Undo keeps a step pending while its goal is gone (deleted in another tab) and restores it once the goal is back", () => {
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    const before = localStorage.getItem(STORAGE_KEY)!;
    // Another tab deletes the whole goal.
    act(() => {
      localStorage.setItem(STORAGE_KEY, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect(goalTitles()).toEqual([]);
    press(button("Undo"));
    const status = host.querySelector('[role="status"]')!.textContent;
    expect(status).not.toContain("Restored");
    expect(status).toContain("1 step is waiting for a goal");
    expect($(".as-toast")).not.toBeNull();
    expect($(".as-toast > span")!.textContent).toBe("“Mini-apps batch”Its goal is gone. Restore the goal, then press Undo.");
    expect(document.activeElement?.textContent).toBe("Undo");
    // The other tab undoes its delete: the goal is back without the step.
    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(JSON.parse(before)));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Deploy demos"]);
    press(button("Undo"));
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Restored step “Mini-apps batch”.");
    expect($(".as-toast")).toBeNull();
  });

  it("an Undo that can restore nothing leaves storage untouched, so another tab's newer save survives", () => {
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    act(() => {
      localStorage.setItem(STORAGE_KEY, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    press(button("Undo"));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("while the toast shows, the page reserves bottom space and scroll padding for it; closing releases it", () => {
    const space = () => document.documentElement.style.getPropertyValue("--as-toast-space");
    expect(space()).toBe("");
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    expect(space()).toMatch(/^\d+px$/);
    expect(parseInt(space(), 10)).toBeGreaterThanOrEqual(32);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(space()).toBe("");
  });

  it("a long step name in the waiting toast truncates on its own line; the instruction is never clamped", async () => {
    const name = "A very long step name ".repeat(12).trim();
    const input = $<HTMLInputElement>(".as-add-step input", card(SAMPLE))!;
    type(input, name);
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    press($(`[aria-label="Remove step ${name}"]`)!, 0);
    act(() => {
      localStorage.setItem(STORAGE_KEY, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    press(button("Undo"));
    expect($(".as-toast .as-toast-name")!.textContent).toBe(`“${name}”`);
    expect(button("Undo", $(".as-toast")!)).toBeTruthy();
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/app-shell.css`, "utf8");
    const waiting = css.match(/\.as-toast\[data-waiting="true"\] > span \{[^}]*\}/)![0];
    expect(waiting).toContain("white-space: normal");
    expect(waiting).not.toMatch(/max-height|line-clamp/);
    expect(css).toMatch(/\.as-toast-name \{[^}]*display: block[^}]*text-overflow: ellipsis; white-space: nowrap/);
    expect($(".as-toast > span")!.textContent).toContain("Restore the goal, then press Undo.");
  });

  it("leaving an emptied step field keeps a title another tab saved meanwhile, and writes nothing", () => {
    const second = $<HTMLInputElement>(`[aria-label="Step 2 of ${SAMPLE}"]`)!;
    type(second, "");
    const latest = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    latest[0].milestones[1].text = "Named in another tab";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    act(() => { second.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].milestones[1].text).toBe("Named in another tab");
  });

  it("adding a step to a goal another tab deleted keeps the draft and says so; it comes back with the goal", () => {
    const before = localStorage.getItem(STORAGE_KEY) ?? JSON.stringify([{ id: "mission-01", title: SAMPLE, archived: false, milestones: [] }]);
    const input = $<HTMLInputElement>(".as-add-step input", card(SAMPLE))!;
    type(input, "Write the README");
    // Another tab deletes the goal; this tab has not had the storage event yet.
    localStorage.setItem(STORAGE_KEY, "[]");
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect(host.querySelector('[role="status"]')!.textContent).toBe(`Could not add “Write the README”: “${SAMPLE}” is no longer here. Your step is kept.`);
    // Visible on the page too, outside the card that is about to disappear.
    expect($(".as-notice p")!.textContent).toBe(`Could not add “Write the README”: “${SAMPLE}” is no longer here. Your step is kept.`);
    expect($(".as-notice")!.closest(".as-goal")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
    act(() => {
      localStorage.setItem(STORAGE_KEY, before);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect($<HTMLInputElement>(".as-add-step input", card(SAMPLE))!.value).toBe("Write the README");
  });

  it("tabbing through a step field without typing writes nothing, even if another tab saved it empty mid-edit", () => {
    const second = $<HTMLInputElement>(`[aria-label="Step 2 of ${SAMPLE}"]`)!;
    const latest = [{ id: "mission-01", title: SAMPLE, archived: false, milestones: [{ id: "a", text: "Base64 + hash tools", done: true }, { id: "b", text: "", done: false }, { id: "c", text: "Deploy demos", done: false }] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    act(() => { second.focus(); });
    act(() => { second.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    expect(saved()[0].milestones[1].text).toBe("");
  });

  it("adding a goal builds on what another tab saved meanwhile, so that tab's new step is kept", () => {
    press(button("New goal"));
    type($<HTMLInputElement>(".as-composer input")!, "Run a 10k");
    // Another tab adds a step; this tab has not had the storage event yet.
    const elsewhere = [{ id: "mission-01", title: SAMPLE, archived: false, milestones: [
      { id: "a", text: "Base64 + hash tools", done: true }, { id: "b", text: "Mini-apps batch", done: false },
      { id: "c", text: "Deploy demos", done: false }, { id: "d", text: "Added in another tab", done: false },
    ] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(elsewhere));
    press(button("Add", $(".as-composer")!));
    expect(saved().map((g: { title: string }) => g.title)).toEqual(["Run a 10k", SAMPLE]);
    expect(saved()[1].milestones.map((m: { text: string }) => m.text)).toContain("Added in another tab");
    expect(steps(SAMPLE)).toContain("Added in another tab");
  });

  it("Archive and Restore set the state their button names, even after another tab changed it", () => {
    const stored = (archived: boolean) => JSON.stringify([{ id: "mission-01", title: SAMPLE, archived, milestones: [] }]);
    // Another tab archives the goal; this tab has not redrawn and still offers Archive.
    localStorage.setItem(STORAGE_KEY, stored(true));
    press(button("Archive", card(SAMPLE)));
    expect(saved()[0].archived).toBe(true);
    expect(host.querySelector('[role="status"]')!.textContent).toBe(`Archived “${SAMPLE}”. It is under Archived.`);
    press(button("Archived", $(".as-side")!));
    // Another tab restores it; this tab still offers Restore.
    localStorage.setItem(STORAGE_KEY, stored(false));
    press(button("Restore", card(SAMPLE)));
    expect(saved()[0].archived).toBe(false);
    expect(host.querySelector('[role="status"]')!.textContent).toBe(`Moved “${SAMPLE}” back to Active.`);
  });

  it("the not-saved notice can be dismissed, and the kept draft adds once the goal is back", () => {
    type($<HTMLInputElement>(".as-add-step input", card(SAMPLE))!, "First try");
    const before = JSON.stringify([{ id: "mission-01", title: SAMPLE, archived: false, milestones: [] }]);
    localStorage.setItem(STORAGE_KEY, "[]");
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect($(".as-notice")).not.toBeNull();
    press(button("Dismiss", $(".as-notice")!));
    expect($(".as-notice")).toBeNull();
    act(() => {
      localStorage.setItem(STORAGE_KEY, before);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect(steps(SAMPLE)).toEqual(["First try"]);
    expect($(".as-notice")).toBeNull();
  });

  it("a successful add clears an earlier not-saved notice", () => {
    type($<HTMLInputElement>(".as-add-step input", card(SAMPLE))!, "First try");
    localStorage.setItem(STORAGE_KEY, "[]");
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "mission-01", title: SAMPLE, archived: false, milestones: [] }]));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect($(".as-notice")).not.toBeNull();
    submit($<HTMLFormElement>(".as-add-step", card(SAMPLE))!);
    expect($(".as-notice")).toBeNull();
  });

  it("a stored goal id like “constructor” renders and takes a step without reading Object.prototype", () => {
    act(() => root.unmount());
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "constructor", title: "Proto", archived: false, milestones: [] }]));
    root = createRoot(host);
    act(() => root.render(<Home />));
    expect(goalTitles()).toEqual(["Proto"]);
    const input = $<HTMLInputElement>(".as-add-step input", card("Proto"))!;
    expect(input.value).toBe("");
    type(input, "First");
    submit($<HTMLFormElement>(".as-add-step", card("Proto"))!);
    expect(steps("Proto")).toEqual(["First"]);
  });
});

describe("archive, delete and undo", () => {
  it("archive moves a goal to Archived and keeps focus on the page; Restore brings it back", () => {
    press(button(`Archive`, card(SAMPLE)));
    expect(host.textContent).toContain("Nothing active");
    expect(document.activeElement?.textContent).toContain("New goal");
    press(button("Archived", $(".as-side")!));
    expect(goalTitles()).toEqual([SAMPLE]);
    expect($("h1")!.textContent).toBe("Archived");
    press(button("Restore", card(SAMPLE)));
    expect(host.textContent).toContain("Nothing archived");
    press(button("Active", $(".as-side")!));
    expect(goalTitles()).toEqual([SAMPLE]);
  });

  it("archiving while the composer is open moves focus to the composer", () => {
    press(button("New goal"));
    press(button("Archive", card(SAMPLE)));
    expect(document.activeElement).toBe($(".as-composer input"));
  });

  it("keyboard delete focuses Undo; Undo restores the goal and focuses its card; mouse delete empties the list", () => {
    press($(`[aria-label="Delete ${SAMPLE}"]`)!, 0);
    expect(goalTitles()).toEqual([]);
    expect(document.activeElement?.textContent).toBe("Undo");
    press(button("Undo"));
    expect(goalTitles()).toEqual([SAMPLE]);
    expect(document.activeElement).toBe(card(SAMPLE));
    press($(`[aria-label="Delete ${SAMPLE}"]`)!, 1);
    expect(host.textContent).toContain("No goals yet");
  });

  it("Escape dismisses; the toast waits while focused and closes six seconds after focus leaves", () => {
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($(".as-toast")).toBeNull();
    expect(document.activeElement?.textContent).toContain("New goal");
    vi.useFakeTimers();
    press($('[aria-label="Remove step Deploy demos"]')!, 0);
    act(() => { vi.advanceTimersByTime(7000); });
    expect($(".as-toast")).not.toBeNull();
    act(() => { button("New goal").focus(); });
    act(() => { vi.advanceTimersByTime(6000); });
    expect($(".as-toast")).toBeNull();
  });

  it("removing a step and then its goal is one batch: Undo brings back the goal with the step in place", () => {
    vi.useFakeTimers();
    press($('[aria-label="Remove step Mini-apps batch"]')!, 0);
    act(() => { vi.advanceTimersByTime(4000); });
    press($(`[aria-label="Delete ${SAMPLE}"]`)!, 0);
    expect(goalTitles()).toEqual([]);
    expect($(".as-toast span")!.textContent).toBe("Removed 2 items");
    expect(host.querySelector('[role="status"]')!.textContent).toContain("Removed 2 items");
    expect(button("Undo").getAttribute("aria-label")).toBe("Undo remove of 2 items");
    // The delete restarted the timer: 4 s + 4 s after the first removal, the toast is still open.
    act(() => { button("New goal").focus(); });
    act(() => { vi.advanceTimersByTime(4000); });
    expect($(".as-toast")).not.toBeNull();
    press(button("Undo"));
    expect(goalTitles()).toEqual([SAMPLE]);
    expect(steps(SAMPLE)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]);
    expect(saved()[0].milestones.map((m: { text: string }) => m.text)).toEqual(["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Restored 2 items.");
  });
});

describe("field edges", () => {
  it("in forced colors, a ticked step draws its tick with system colors, after the normal rules", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/app-shell.css`, "utf8");
    const block = css.indexOf("@media (forced-colors: active)");
    expect(block).toBeGreaterThan(css.indexOf(".as-check input:checked + span {"));
    const rules = css.slice(block);
    expect(rules).toContain("forced-color-adjust: none");
    expect(rules).toMatch(/\.as-check input:checked \+ span \{[^}]*background: Highlight/);
    expect(rules).toMatch(/\.as-check input:checked \+ span::after \{[^}]*border: solid HighlightText/);
    expect(rules).toMatch(/\.as-check span \{[^}]*border-color: CanvasText/);
  });

  it("step and add-step inputs show the 3:1 field edge at rest, not only on hover or focus", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/app-shell.css`, "utf8");
    for (const selector of [".as-step-input {", ".as-add-step input {"]) {
      const rule = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)));
      expect(rule).toContain("border: 1px solid var(--as-field-line)");
      expect(rule).not.toContain("transparent");
    }
  });
});
