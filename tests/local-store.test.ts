import { describe, expect, it, vi } from "vitest";
import { createLocalStore } from "@/lib/local-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const parse = (raw: string | null) => (raw === null ? [] : (JSON.parse(raw) as number[]));
const serialize = (value: number[]) => JSON.stringify(value);

describe("createLocalStore", () => {
  it("reads the stored value and returns the same snapshot while storage is unchanged", () => {
    const storage = fakeStorage({ k: "[1,2]" });
    const store = createLocalStore("k", parse, serialize, () => storage);
    expect(store.getSnapshot()).toEqual([1, 2]);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("server snapshot is the parsed empty value", () => {
    const store = createLocalStore("k", parse, serialize, () => undefined);
    expect(store.getServerSnapshot()).toEqual([]);
  });

  it("set writes storage and notifies subscribers; unsubscribe stops it", () => {
    const storage = fakeStorage();
    const store = createLocalStore("k", parse, serialize, () => storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set((prev) => [...prev, 3]);
    expect(storage.data.get("k")).toBe("[3]");
    expect(store.getSnapshot()).toEqual([3]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set([4]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("set skips the write and the notify when the value is unchanged", () => {
    const storage = fakeStorage({ k: "[1]" });
    const setItem = vi.spyOn(storage, "setItem");
    const store = createLocalStore("k", parse, serialize, () => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set((prev) => prev);
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    store.set((prev) => [...prev, 2]);
    expect(storage.data.get("k")).toBe("[1,2]");
  });

  it("keeps working in memory when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const store = createLocalStore("k", parse, serialize, () => broken);
    expect(store.getSnapshot()).toEqual([]);
    store.set([5]);
    expect(store.getSnapshot()).toEqual([5]);
  });
});

describe("set reports whether the browser saved the value", () => {
  it("true when written or unchanged, false when storage refuses the write, true when storage is blocked outright", () => {
    const storage = fakeStorage();
    const store = createLocalStore("k", parse, serialize, () => storage);
    expect(store.set([1])).toBe(true);
    expect(store.set((prev) => prev)).toBe(true);
    storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
    expect(store.set([1, 2])).toBe(false);
    expect(store.getSnapshot()).toEqual([1, 2]);
    const blocked = createLocalStore("k", parse, serialize, () => { throw new DOMException("denied", "SecurityError"); });
    expect(blocked.set([3])).toBe(true);
  });
});

describe("set with onlyIfSaved", () => {
  it("a refused write changes neither storage nor the snapshot", () => {
    const storage = fakeStorage({ k: "[1]" });
    const store = createLocalStore("k", parse, serialize, () => storage);
    store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
    expect(store.set([1, 2], { onlyIfSaved: true })).toBe(false);
    expect(store.getSnapshot()).toEqual([1]);
    expect(storage.data.get("k")).toBe("[1]");
    expect(listener).not.toHaveBeenCalled();
  });
});
