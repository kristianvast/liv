import { BIN_MINUTES, type Bin, DEFAULTS, judge } from "./rule";

const BIN_MS = BIN_MINUTES * 60_000;

/** One reading of the watched cow: `lying` is 1 when she lies, 0 when she stands, or a share between. */
export type Sample = { readonly ts: string; readonly lying: number };
export type ZoneSamples = { readonly zone: string; readonly samples: readonly Sample[] };

export type Source = {
  /** Readings newer than `after`, oldest first, for every pen the farm computer watches. */
  posture(after: string | null): Promise<readonly ZoneSamples[]>;
};

export type ZoneState = {
  readonly earTag: string;
  /** Start of her first 5-minute bin. */
  readonly start: string;
  readonly sums: readonly number[];
  readonly counts: readonly number[];
  readonly warned: boolean;
};

export type State = {
  readonly cursor?: string;
  readonly zones?: Readonly<Record<string, ZoneState>>;
};

export type Config = {
  readonly url: string;
  /** Pen name as the posture feed names it -> ear tag number of the cow in it now. */
  readonly zones?: Readonly<Record<string, string>>;
  readonly baselineHours?: number;
  readonly windowHours?: number;
};

export type Context = {
  readonly config: Config;
  readonly secret: string | null;
  readonly state: State | null;
  readonly log: (message: string) => void;
};

export type Observation = {
  readonly earTag: string;
  readonly kind: "calving_alert";
  readonly ts: string;
  readonly valueNum: number;
  readonly valueJson: Record<string, unknown>;
};

class MissingSecretError extends Error {
  override readonly name = "MissingSecretError";
}

export class PostureFeedError extends Error {
  override readonly name = "PostureFeedError";
  constructor(readonly status: number) {
    super(`the posture feed answered ${status}`);
  }
}

export function httpSource(config: Config, secret: string): Source {
  return {
    async posture(after) {
      const query = after === null ? "" : `?after=${encodeURIComponent(after)}`;
      const res = await fetch(`${config.url}/v1/posture${query}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new PostureFeedError(res.status);
      return ((await res.json()) as { readonly zones: readonly ZoneSamples[] }).zones;
    },
  };
}

export default function sync(ctx: Context) {
  if (ctx.secret === null) {
    throw new MissingSecretError("the posture feed token is missing from the OS keychain");
  }
  return syncWith(httpSource(ctx.config, ctx.secret), ctx);
}

function addSamples(zone: ZoneState, samples: readonly Sample[]): ZoneState {
  const start = Date.parse(zone.start);
  const sums = [...zone.sums];
  const counts = [...zone.counts];
  for (const sample of samples) {
    const bin = Math.floor((Date.parse(sample.ts) - start) / BIN_MS);
    if (bin < 0) continue;
    while (sums.length <= bin) {
      sums.push(0);
      counts.push(0);
    }
    sums[bin] = (sums[bin] ?? 0) + sample.lying;
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  return { ...zone, sums, counts };
}

/** Finished bins only: the bin holding the newest reading may still get more. */
function closedBins(zone: ZoneState): Bin[] {
  return zone.counts.slice(0, -1).map((count, bin) => {
    return count === 0 ? null : (zone.sums[bin] ?? 0) / count;
  });
}

export async function syncWith(source: Source, ctx: Context) {
  const options = {
    ...DEFAULTS,
    windowBins: ((ctx.config.windowHours ?? 6) * 60) / BIN_MINUTES,
    baselineBins: ((ctx.config.baselineHours ?? 48) * 60) / BIN_MINUTES,
  };
  const zones: Record<string, ZoneState> = { ...ctx.state?.zones };
  const observations: Observation[] = [];
  let cursor = ctx.state?.cursor ?? null;
  for (const { zone: name, samples } of await source.posture(cursor)) {
    const first = samples[0];
    const newest = samples.at(-1);
    if (first === undefined || newest === undefined) continue;
    if (cursor === null || Date.parse(newest.ts) > Date.parse(cursor)) cursor = newest.ts;
    const earTag = ctx.config.zones?.[name];
    if (earTag === undefined) continue;
    const kept = zones[name];
    // A new ear tag on the pen means another cow moved in: her normal days start over.
    const before =
      kept?.earTag === earTag
        ? kept
        : {
            earTag,
            start: new Date(Math.floor(Date.parse(first.ts) / BIN_MS) * BIN_MS).toISOString(),
            sums: [],
            counts: [],
            warned: false,
          };
    if (before.warned) {
      zones[name] = before;
      continue;
    }
    const zone = addSamples(before, samples);
    const { limit, warning } = judge(closedBins(zone), options);
    if (warning === null || limit === null) {
      zones[name] = zone;
      continue;
    }
    const hours = (options.windowBins * BIN_MINUTES) / 60;
    const percent = (share: number) => Math.round(share * 100);
    observations.push({
      earTag,
      kind: "calving_alert",
      ts: new Date(Date.parse(zone.start) + (warning.bin + 1) * BIN_MS).toISOString(),
      valueNum: warning.share,
      valueJson: {
        note: `Lying much less than on her normal days: ${percent(warning.share)} % of the last ${hours} hours, her lowest before was ${percent(limit)} %. This is a trial rule, so check her yourself.`,
        rule: "lying_time",
        zone: name,
        limit,
        windowHours: hours,
      },
    });
    zones[name] = { ...zone, warned: true };
  }
  ctx.log(`Calving watch: ${Object.keys(zones).length} pens, ${observations.length} warnings`);
  const state: State = { ...(cursor === null ? {} : { cursor }), zones };
  return { observations, state };
}
