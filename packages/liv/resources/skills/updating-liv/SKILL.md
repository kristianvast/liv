---

name: updating-liv
description: Move the farm's own Liv (a build from source with the farm's changes) to a newer Liv version and keep those changes. Use when the farmer pressed Update in Liv, asks to update Liv, or a newer Liv came out while the farm runs its own build.
---

# Updating Liv

A farm that changed Liv runs its own build from source. A new Liv version does not reach that
build by itself: its changes have to be moved onto the new version first. `liv_update` does the
whole job in one step:

1. pulls the new version from git,
2. puts each of the farm's changes back on top, oldest first,
3. installs what the new version needs,
4. checks and builds it exactly like `local_ui_build` (typecheck, Liv's own check and start
   test, the app build).

Nothing changes unless every step passes. A failure puts the source back as it was, and Liv
keeps running.

## Steps

1. Say in one short line what you are doing: getting the new version and putting the farm's
   changes on top. It takes a few minutes, needs the internet, and Liv keeps working meanwhile.
   The farmer already asked for this by pressing Update, so you do not need a yes.
2. Run `liv_update` with the version from the farmer's message. Leave the version out to get the
   newest.
3. Read the result and do what it says:
   - **Updated**: tell the farmer which of their changes are kept, and any that the new version
     already has. Then pass on how to see it, and that pressing "Restart to update" in the bar at
     the top finishes the update. If the result says Liv moves to the new version after this
     reply, finish the reply and start nothing else.
   - **Nothing to do**: the farm's Liv is already on that version. Say so and say that "Restart
     to update" finishes it, if the bar shows it.
   - **A change clashes**: nothing changed. In plain words, tell the farmer which of their
     changes clashes (the summary in the result) and that the new version changed the same place.
     Ask: update now without that change, then make it again on the new version? With a yes, run
     `liv_update` again with `leaveOut` set to that change's id. Then make the change again by
     following editing-liv, fitted to the new version, and finish with `local_ui_build`. A no
     leaves everything as it is.
   - **A check failed** (typecheck, Liv's check or start, the build): the update was undone.
     The result lists the farm's changes with the files each one touches.
     - When the error is in a file one of those changes touches, that change no longer fits the
       new version. Treat it like a clash: ask, then leave it out and make it again.
     - When the error is anywhere else, the new version itself failed on this computer. Tell the
       farmer that Liv stays as it was, and offer feedback_send with the error.
     - When the result says Liv runs the original app, run `local_ui_build` once to bring back
       the farm's previous build.
   - **Download or install failed**: check that the internet is up, then try once more. If it
     fails again, tell the farmer that Liv stays as it was.
4. Never edit Liv's source by hand to move changes across, never run git rebase, merge or reset
   yourself, and never claim the update is done before the result says "Updated".

## The farmer chose to update without their changes

Liv then switches the farm's own build off at the next start and runs the new original. The
farm's changes stay in the source. When the farmer wants them back, run `liv_update` as above.
