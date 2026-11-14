import { useSyncExternalStore } from "react";

// Whether the tour of Home has been seen on this computer. Kept in localStorage, so it plays once.
const KEY = "orbit.tour";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage?.getItem(KEY) === "seen";
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage?.setItem(KEY, "seen");
  } catch {
    // Storage can be switched off; the tour is then simply not remembered.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTourSeen(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
