# Calving watch connector payload

Reads a posture feed on the farm network and adds a `calving_alert` observation when the cow in a
calving pen lies clearly less than on her own normal days. Experimental: see `../AGENTS.md`.

Required config: `url` (the feed), `zones` (pen name in the feed -> ear tag number of the cow in it).
Optional config: `baselineHours` (48), `windowHours` (6).
The feed's bearer token comes from Liv's OS keychain as `ctx.secret`.

## The posture feed it expects

`GET <url>/v1/posture?after=<ISO time>` with `Authorization: Bearer <token>` answers

```json
{ "zones": [{ "zone": "pen-left", "samples": [{ "ts": "2026-11-19T12:35:00Z", "lying": 1 }] }] }
```

- One entry per pen it watches, samples oldest first and newer than `after` (all it has when
  `after` is missing).
- `lying` is 1 when the cow lies and 0 when she stands; a share between 0 and 1 is fine when one
  sample covers several frames. Leave a sample out when the cow was not found: missing is not
  standing.
- One sample a minute is enough. Samples are averaged into 5-minute bins.

Liv does not ship this feed. It is the camera side: a cow detector, a pose model and a
lying/standing classifier running on the farm's own computer.

## The rule (`rule.ts`)

- Lying share over the last 6 hours, per 5-minute bin; a window counts only when the cow was found
  in at least half of it.
- The limit is her lowest 6-hour value during her first 48 hours in the pen.
- A warning is three bins in a row (15 minutes) below that limit, after those 48 hours.
- One warning per cow per stay. A new ear tag on the pen starts a new stay.

State keeps the feed cursor and each pen's bins. Run `bun test` here; the tests replay a real
recorded calving from `fixtures/` and need no feed.
