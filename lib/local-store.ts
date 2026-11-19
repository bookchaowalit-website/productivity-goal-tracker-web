import { useSyncExternalStore } from "react";

// A tiny localStorage-backed store read through useSyncExternalStore, so the page
// hydrates from storage without calling setState inside an effect.
// This repository owns its copy (no shared package across repos).

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type LocalStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  /** Returns false only when the browser refused the write (e.g. storage full); the value is still kept in memory. */
  set: (next: T | ((prev: T) => T)) => boolean;
};

function browserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function createLocalStore<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
  storage: () => StorageLike | undefined = browserStorage,
): LocalStore<T> {
  const listeners = new Set<() => void>();
  const empty = parse(null);
  let memory: string | null = null;
  let cache: { raw: string | null; value: T } = { raw: null, value: empty };

  function readRaw(): string | null {
    try {
      const store = storage();
      return store ? store.getItem(key) : memory;
    } catch {
      return memory;
    }
  }

  function getSnapshot(): T {
    const raw = readRaw();
    if (raw !== cache.raw) cache = { raw, value: parse(raw) };
    return cache.value;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent) {
    if (event.key === key) notify();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot,
    getServerSnapshot: () => empty,
    set(next) {
      const prev = getSnapshot();
      const value = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      // Nothing changed (e.g. an Undo that could restore nothing): don't write, so another tab's newer save is not
      // overwritten with this tab's copy.
      if (Object.is(value, prev)) return true;
      memory = serialize(value);
      let saved = true;
      let target: StorageLike | undefined;
      try {
        target = storage();
      } catch {
        // Storage is blocked outright (no access at all): this tab runs from memory, which counts as saved.
      }
      try {
        target?.setItem(key, memory);
      } catch {
        // Storage is reachable but refused the write (full): keep the value in memory and tell the caller.
        saved = false;
      }
      cache = { raw: readRaw(), value };
      notify();
      return saved;
    },
  };
}

export function useLocalStore<T>(store: LocalStore<T>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
