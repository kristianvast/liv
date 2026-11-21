import { expect, test } from "bun:test";
import sync, { type Context, type Sample, type Source, type State, syncWith } from "./connector";
import recorded from "./fixtures/calving-2026-11-19.json";
import { BIN_MINUTES } from "./rule";

const BIN_MS = BIN_MINUTES * 60_000;

/** The recorded days as the posture feed would hand them out: one reading per bin she was found in. */
function feed(bins: readonly (number | null)[], zone = "pen-left"): Source {
  const samples: Sample[] = bins.flatMap((lying, bin) =>
    lying === null
      ? []
      : [{ ts: new Date(Date.parse(recorded.start) + bin * BIN_MS).toISOString(), lying }],
  );
  return {
    async posture(after) {
      const fresh = samples.filter((s) => after === null || Date.parse(s.ts) > Date.parse(after));
      return [{ zone, samples: fresh.slice(0, 12) }];
    },
  };
}

function context(state: State | null, zones: Record<string, string>): Context {
  return { config: { url: "http://feed.test", zones }, secret: "token", state, log: () => {} };
}

async function replay(source: Source, zones: Record<string, string>, runs: number) {
  let state: State | null = null;
  const alerts = [];
  for (let run = 0; run < runs; run++) {
    const result = await syncWith(source, context(state, zones));
    alerts.push(...result.observations);
    state = result.state;
  }
  return { alerts, state };
}

test("hourly runs over the recorded days send one calving alert, at 12:40 on the calving day", async () => {
  const { alerts } = await replay(feed(recorded.cameras.overhead), { "pen-left": "1042" }, 80);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({
    earTag: "1042",
    kind: "calving_alert",
    ts: "2026-11-19T12:40:00.000Z",
  });
  expect(alerts[0]?.valueJson.note).toContain("trial rule");
});

test("a pen with no cow assigned gives no alert but the feed is still read forward", async () => {
  const { alerts, state } = await replay(feed(recorded.cameras.overhead), {}, 80);
  expect(alerts).toHaveLength(0);
  expect(state?.cursor).toBe("2026-11-20T00:55:00.000Z");
});

test("another cow in the pen starts her own normal days", async () => {
  const source = feed(recorded.cameras.overhead);
  const first = await replay(source, { "pen-left": "1042" }, 60);
  const moved = await syncWith(source, context(first.state, { "pen-left": "2077" }));
  expect(moved.state.zones?.["pen-left"]).toMatchObject({ earTag: "2077", warned: false });
  expect(moved.state.zones?.["pen-left"]?.counts.length).toBeLessThanOrEqual(12);
});

test("the feed token must be in the keychain", () => {
  expect(() => sync({ ...context(null, {}), secret: null })).toThrow("OS keychain");
});
