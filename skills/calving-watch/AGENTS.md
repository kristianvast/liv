# Calving watch: where this stands

For coding agents and developers working on camera calving detection. `SKILL.md` is what Liv tells
the farmer; this file is what we know, what is built and what is missing. Last updated 2026-11-21.

## In one paragraph

We watch one cow in a calving pen and measure how much of the time she lies down. On the one
calving we have on video from start to end, her lying time over the last 6 hours fell below anything
from her two normal days about 6 hours before the birth, on two cameras. That is one cow. We have
not measured how often the rule warns for a cow that is not calving. Treat everything here as a
promising trial, not a validated alarm.

## What is built

| Part                                                                                             | State                                                    | Where                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------- |
| The lying-time rule                                                                              | Built; reproduces the research result on the real series | `connector/rule.ts`               |
| Connector: posture feed in, `calving_alert` out, once per cow per stay                           | Built; tested against a replay of the real days          | `connector/connector.ts`          |
| Real recorded series (two cameras, 3 days, 5-minute bins)                                        | In the repo as a test fixture                            | `connector/fixtures/`             |
| What Liv tells the farmer                                                                        | Written                                                  | `SKILL.md`                        |
| Posture feed on the farm computer (detector, pose model, lying/standing classifier, HTTP answer) | NOT built for production                                 | contract in `connector/README.md` |
| Lying/standing classifier that works on any cow and pen                                          | NOT built; the research one was taught on one cow        | see "Models"                      |
| False-alarm count                                                                                | NOT measured                                             | see "Next steps"                  |
| Run on a live farm                                                                               | NOT done                                                 |                                   |

## What we found (research, November 2026)

One calving on a pilot dairy farm: a red-and-white cow alone in one fenced half of a calving pen,
an overhead camera and a corner camera, calf on the bedding at 18:43. Her two days before are the
normal days. Scored afterwards on the recordings.

What warned:

| Measure                                                             | Overhead camera   | Corner camera                                  | Checked in the frames                   |
| ------------------------------------------------------------------- | ----------------- | ---------------------------------------------- | --------------------------------------- |
| Lying time over 6 h, from our detector + keypoints                  | 6 h 03 min before | 4 h 38 min before (5 h 38 min on a 3 h window) | True                                    |
| Lying time, from an image-language model reading one frame a minute | 5 h 43 min        | 5 h 48 min                                     | Same picture                            |
| Movement in her half of the pen (pixel change)                      | 2 h 48 min        | 2 h 58 min                                     | Partly: fresh bedding also moves pixels |
| Short lying spells (2 to 20 minutes)                                | 2 h 13 min        | no                                             | True on the overhead camera             |
| Turning of her body axis                                            | 53 min            | 4 h 28 min                                     | True on the overhead camera             |

- In the last six hours she lay 24 % of the time, against 43 % and 54 % in the same clock hours on
  her two normal days (corner camera: 19 % against 46 % and 55 %).
- Why: on normal days she lies 1.5 to 2 hours at a time. On the calving day, in the eight hours
  before she lay down to calve, she lay only twice for about 15 minutes and twice for 3 to 4
  minutes, getting straight up again. 14 of her 18 lying spells that day were under 20 minutes,
  against 2 of 15 and 1 of 12.

What did not warn (do not rebuild these as the alarm):

- An image-language model asked directly for calving signs: it called every frame of the last hour
  "no signs", including 27 minutes of labour, and reported a calf in about 54 frames on each normal
  day. It does confirm a birth: it saw the calf one minute after.
- Movement of the detector box centre: never left the range of the normal days.
- Count of lying/standing changes from keypoints: mostly classifier flicker (about 12 changes an
  hour where a careful reading sees under 3).
- "Hours since she last lay down": the 3-minute lie-downs that are themselves a sign reset it.
- Tail raised and signs at her rear: cannot be judged from above; our pose model has no tail points.
- An earlier calving on the same farm fell inside a recording gap; only its aftermath was scored
  (afterbirth and farmer activity are visible, nothing warned beforehand).

## Models

- Cow detector: RTMDet, fine-tuned on synthetic barn renders.
- Keypoints: RTMPose-m, 31 points, no tail points.
- Lying/standing classifier: logistic regression on 96 numbers (where each keypoint falls in the box,
  each keypoint's confidence, box width, height and shape), one per camera. Taught by one day of
  posture labels from an image-language model (about 1,400 frames), so it needs no hand labels but
  inherits that model's mistakes.
- Agreement with those labels on the next day: 93 % overhead, 88 % corner. This is agreement with
  another model on the same cow, not accuracy against human labels.
- It needs both the box and the keypoints. Retrained on parts of its input (overhead / corner):
  box only 83 % / 58 %, keypoint positions only 86 % / 78 %, all 93 % / 88 %.
- Weak spot: when the cow is under an overhead catch cage the keypoints land on the cage. There the
  classifier agrees on 84 % of lying frames and 75 % of standing frames, against 96 % elsewhere.
  Those errors make her look more rested than she is, so they hide warnings; they do not create
  them.
- The image-language model costs roughly 1,600 tokens a frame, about 1 to 3 USD per camera per day
  at one frame a minute. Use it to label, not at run time: it is a preview model, it stalled during
  our run, it sends barn images off the farm, and its direct calving answers were useless.

## Known limits of the rule

- One calving. Published camera systems with similar signs report a first warning about 2.4 hours
  ahead (median), catching about 94 % of calvings, with roughly 3 in 10 alerts early or false
  (Nabenishi et al. 2026, Animal Science Journal, doi 10.1111/asj.70218). Expect that range, not six
  hours every time.
- The limits were set after seeing the data, and three window lengths were tried.
- Only two normal days. Judged against the first alone, the second already crosses the limit several
  times; it may itself be an early day.
- It needs her own normal days: a cow moved in the day before calving has no baseline.
- It follows one cow per pen or pen half. A shared pen needs to know which cow is which.
- A black cow is the obvious risk for the pose model, and so for the classifier.

## Next steps, in order

1. Count false alarms: run the fixed rule on every recorded day of a pen with a cow that did not
   calve. If it warns more than about once per cow per week, change the rule before anything else.
2. Score the next recorded calving with the rule exactly as it is in `rule.ts`. That is the first
   honest repeat.
3. Label lying/standing frames by hand across several pens, coats and under cages, and train one
   classifier (or give the detector two classes, "cow standing" and "cow lying", which drops the
   pose model and is how most published systems do it). Stop depending on per-cow labels.
4. Build the posture feed for the farm computer against the contract in `connector/README.md`.
5. Run it silently beside the farmer for several calvings and compare with what they saw, before it
   sends anything.

## Rules for agents working here

- A `calving_alert` observation is pushed to the farmer's phone as "Calving alert". Never loosen the
  rule, lower the hold time or emit test alerts on a real farm.
- Never describe this as validated, in copy, in `SKILL.md` or to a farmer. Keep "experimental" in
  the skill description until steps 1, 2 and 5 are done.
- Missing is not standing. A cow that is not found must never count as a cow that stands.
- If you change `rule.ts`, the fixture test must still give the recorded warning times, or you must
  say in this file why they changed.
- This repository is public. Do not name farms, farmers, camera addresses, storage buckets or
  recordings here.
- Keep this file current: when a step above is done or fails, change the tables and the date.

## Verify

```bash
bun test ./skills/calving-watch     # replays the recorded calving: one alert, 6 h 03 min ahead
bun run skills:index --check        # catalog index matches the files
bunx biome check skills/calving-watch
```

The recordings, the scoring scripts and the full write-up live in Agrointel's private research
repository (`barn-simulation`: `tools/calving_detect/`,
`docs/research/2026-11-20_calving_early_warning.md`).
