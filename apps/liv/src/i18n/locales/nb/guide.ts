import type { Catalog } from "../../core";
import type { guide as en } from "../en/guide";

export const guide: Catalog<typeof en> = {
  "overlay.region": "Liv skjermveiviser",
  "note.withText": "Liv: {note}",
  "note.pointing": "Liv: {label}",
  "note.pointingFallback": "Liv peker her",
  "note.close": "Lukk Livs veiviser",
  "announcement.withText": "Liv peker på {label}: {note}",
  "announcement.noteOnly": "Liv: {note}",
  "announcement.pointing": "Liv peker på {label}",
  "browser.region": "Livs nettleser",
  "browser.untitled": "Nettside",
  "browser.frameAlt": "Side åpen i Livs nettleser: {title}",
  "browser.noteWithText": "Liv: {note}",
  "browser.pointing": "Liv peker her",
};
