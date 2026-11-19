---

name: editing-liv
description: Change Liv itself (an existing screen, the menu, the words on screen, or Liv's own instructions, tools and skills) by building the farm's own copy from source. Use when a custom page is not enough because the farmer wants to change what Liv already shows or how you work.
---

# Editing Liv

Read and follow `ui-design` before changing anything with a screen.

Liv's installed app is a fixed build. To change it you edit a copy of its source and build it.
Two tools do all the heavy work, so the whole job is three steps:

1. `liv_source` makes the source ready (downloads the installed version the first time).
2. You edit the files.
3. `local_ui_build` records the edits, checks them, builds, and switches the result on.

Liv falls back to the original by itself if a build ever fails to start, and the farmer can
switch back in Settings > Your Liv.

Prefer a custom page (custom-pages skill) when the farmer only needs a new screen.

## Before the first time

Tell the farmer that Liv will switch to a copy you build on this computer, that the first build
takes a few minutes and needs the internet once, and that they can switch back in Settings > Your
Liv. Wait for a yes. After that first time you do not need to ask again for each change.

## Every change

1. Run `liv_source`. It returns the folder and where things are. Do not look for the source
   anywhere else, and do not clone or install by hand.
2. Find the place: `grep -rn "<text the farmer sees>" "<source>/apps/liv/src"`. The words on
   screen live in `apps/liv/src/i18n/locales/<language>/`; change every language that has the
   text. Read a file before you change it, and follow `<source>/AGENTS.md`.
3. Edit. What you may change:
   - `apps/liv/src`: the app's screens (React + TypeScript).
   - `packages/liv/src` and `packages/liv/resources`: Liv itself. Your instructions are in
     `packages/liv/src/agent/hub.ts`, your tools in `packages/liv/src/agent/`, your skills in
     `packages/liv/resources/skills/`.
   - `packages/protocol` only together with both sides that use it (the app and Liv), in the
     same build.
   - Never `packages/schema` or `packages/sync`: a changed database would stop this farm syncing
     with its other devices.
4. Run `local_ui_build` with a `summary` of the change in the farmer's words. If it fails, read the
   output, fix the code, and run it again. Never tell the farmer it worked until the tool says
   "Built and checked".
5. Tell the farmer what changed and how to see it, exactly as the result says: Liv reloaded by
   itself, or they press "Open new version" at the top of Liv (closing and reopening Liv works
   too). When you changed Liv, the result says Liv restarts by itself after your reply: finish
   the reply and start nothing else.

## After a Liv update

A new Liv version does not reach the farm's own build by itself. Follow updating-liv: one
`liv_update` moves the farm's changes onto the new version, checks and builds it.

## Undo

- One change: `git -C "<source>" revert <commit>`, then `local_ui_build`.
- Everything: `local_ui_disable` (the source stays, so a build turns it back on).
