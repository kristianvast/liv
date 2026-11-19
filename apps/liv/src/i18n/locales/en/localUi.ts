import type { Messages } from "../../core";

export const localUi = {
  title: "Your Liv",
  "badge.none": "Original",
  "badge.ready": "Your build",
  "badge.broken": "Safe mode",
  "badge.unknown": "Unknown",
  "none.body":
    "You are using the original app. Ask Liv to change a screen and it builds your own copy; you can come back here any time.",
  "ready.body": "Your own build of the app is ready. Liv opens it every time it starts.",
  "broken.body":
    "Your own build did not start last time, so Liv opened the original app. Ask Liv to fix it, or open it again.",
  "local.body": "You are using your own build of the app, made by Liv on this PC.",
  "local.noReturn": "Restart Liv to open the original app.",
  builtAt: "Built {time}",
  open: "Open your Liv",
  useOriginal: "Use original Liv",
  failed: "Could not switch",
} as const satisfies Messages;
