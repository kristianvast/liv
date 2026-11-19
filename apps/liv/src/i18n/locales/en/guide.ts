import type { Messages } from "../../core";

export const guide = {
  "overlay.region": "Liv screen guide",
  "note.withText": "Liv: {note}",
  "note.pointing": "Liv: {label}",
  "note.pointingFallback": "Liv is pointing here",
  "note.close": "Dismiss Liv guide",
  "announcement.withText": "Liv is pointing to {label}: {note}",
  "announcement.noteOnly": "Liv: {note}",
  "announcement.pointing": "Liv is pointing to {label}",
  "browser.region": "Liv's browser",
  "browser.untitled": "Web page",
  "browser.frameAlt": "Page open in Liv's browser: {title}",
  "browser.noteWithText": "Liv: {note}",
  "browser.pointing": "Liv is pointing here",
} as const satisfies Messages;
