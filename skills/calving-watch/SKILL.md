---

name: calving-watch
description: Experimental: warn some hours before a cow calves, from how little she lies down in a calving pen watched by a camera. Tested on one calving so far. Use only when the farmer wants to try camera calving warnings and a posture feed is running on the farm's own computer.
---

# Calving watch (experimental)

A cow close to calving stops lying for long stretches: she stands, walks, lies down for a few
minutes and gets up again. This skill's connector reads how much of the time the cow in a calving
pen is lying, compares the last 6 hours with her own first two days in the pen, and adds a calving
alert when she lies clearly less than she ever did on those days.

## Tell the farmer this first

- It is a trial. The rule gave about six hours of warning on the one calving it was tested on. How
  often it warns for a cow that is not calving has not been measured, and it will miss some calvings.
- The alert is sent to their phone like any other calving alert. It means "go and look at her", never
  "she is calving".
- It does not replace their own checks. Keep watching a cow that is due.

Only set it up if the farmer still wants it after hearing that.

## What it needs

- A camera that sees the whole calving pen, and one cow per pen (or per fenced half of a pen).
- A posture feed on the farm's own computer: a small service that watches that camera and answers
  whether the cow is lying or standing (see `connector/README.md` for what it must answer). Liv does
  not ship this service. If the farm does not have one, say so and stop; do not build a stand-in
  from guesses.
- The ear tag number of the cow in each pen, and two days of her in the pen before the rule can warn.

## Set up

1. Ask where the posture feed runs (address and port) and what it calls each pen.
2. `connector_scaffold` with `{ "name": "calving-watch", "fromSkill": "calving-watch" }`. It copies
   the connector into `connectors/calving-watch/` and registers it switched off.
3. `connector_configure` with the connector id and
   `{ "url": "http://...", "zones": { "<pen name>": "<ear tag number>" } }`.
   Never put the feed's token in config or files.
4. Ask the farmer to open Connections > Password on the Calving watch card for the token, and to
   switch the connector on.
5. `connector_run` once and report how many pens it read. No warning is possible until a cow has
   been in her pen for two days.

## When a cow moves

When another cow goes into a pen, run `connector_configure` again with her ear tag number on that
pen. Her two normal days start over. When a pen is empty, remove it from `zones`.

## When it warns

Tell the farmer which cow, and that she has been lying much less than on her normal days. Suggest
they look at her. Never say she is calving or how long it will take; you cannot know that. If they
tell you it was a false warning or that she calved without one, record what happened and offer to
send it to the Liv team: every such case is needed to judge this rule.

## When it fails

- "the posture feed answered 401": the token is wrong. "answered 404" or a timeout: wrong address,
  or the feed is not running.
- No warnings ever: check that the pen names in `zones` match the names the feed uses, and that the
  cow has been in the pen for two days.
