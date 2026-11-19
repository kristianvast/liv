import type { Messages } from "../../core";

export const connection = {
  "title.unauthorized": "Liv rejected the security token",
  "title.connecting": "Connecting to Liv on this farm PC…",
  "title.unreachable": "Liv assistant is not reachable right now",
  "title.stopped": "Liv has stopped",
  "detail.stopped":
    "Liv's assistant kept stopping after restarts. Your farm data is safe on this PC. Details: {reason}",
  "detail.unauthorized": "Restart Liv so it can set up a fresh local session token.",
  "detail.waiting":
    "Waiting for local Liv agent at {url}. Your farm data stays safe on this PC and will appear automatically once connected.",
  "state.connecting": "connecting",
  "state.reconnecting": "Reconnecting",
  "state.closed": "closed",
  "state.unauthorized": "unauthorized",
  "state.stopped": "Stopped",
  retry: "Retry connection",
  restart: "Restart Liv",
} as const satisfies Messages;
