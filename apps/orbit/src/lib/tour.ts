import { useSyncExternalStore } from "react";

// Where a farmer is on the way in: "pending" from the moment Home asks them to sign in until the
// tour of Home has been seen, "done" otherwise on an install where Orion can answer. Kept in localStorage so it survives
// the restart after sign-in.
const KEY = "orbit.firstRun";
type FirstRun = "pending" | "done" | null;

const listeners = new Set<() => void>();

function read(): FirstRun {
  try {
    const raw = window.localStorage?.getItem(KEY);
    return raw === "pending" || raw === "done" ? raw : null;
  } catch {
    return null;
  }
}

export function setFirstRun(next: "pending" | "done"): void {
  if (read() === next) return;
  try {
    window.localStorage?.setItem(KEY, next);
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

export function useFirstRun(): FirstRun {
  return useSyncExternalStore(subscribe, read, () => null);
}
