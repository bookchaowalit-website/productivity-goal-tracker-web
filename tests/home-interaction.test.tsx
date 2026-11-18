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
    for (const text of ["Base64 + hash tools", "Mini-apps batch", "Deploy demos"]) press($(`[aria-label="Remove step ${text}"]`)!, 1);
    expect(card(SAMPLE).textContent).toContain("No steps yet");
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

  it("keyboard delete focuses Undo; Undo restores the goal and focuses New goal; mouse delete empties the list", () => {
    press($(`[aria-label="Delete ${SAMPLE}"]`)!, 0);
    expect(goalTitles()).toEqual([]);
    expect(document.activeElement?.textContent).toBe("Undo");
    press(button("Undo"));
    expect(goalTitles()).toEqual([SAMPLE]);
    expect(document.activeElement?.textContent).toContain("New goal");
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
