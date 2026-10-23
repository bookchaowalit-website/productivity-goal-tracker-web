import { useSyncExternalStore } from "react";

// A tiny localStorage-backed store read through useSyncExternalStore, so the page
// hydrates from storage without calling setState inside an effect.
// This repository owns its copy (no shared package across repos).

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type LocalStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (next: T | ((prev: T) => T)) => void;
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
      const value = typeof next === "function" ? (next as (prev: T) => T)(getSnapshot()) : next;
      memory = serialize(value);
      try {
        storage()?.setItem(key, memory);
      } catch {
        // Storage is blocked or full: keep the value in memory for this tab.
      }
      cache = { raw: readRaw(), value };
      notify();
    },
  };
}

export function useLocalStore<T>(store: LocalStore<T>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
