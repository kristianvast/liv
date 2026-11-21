// The lying-time rule: a cow close to calving stops lying for long stretches, so her lying time over
// the last hours falls below anything she showed on her own normal days. Tested on one recorded
// calving (see ../AGENTS.md); the limits here are the ones that test used.

export const BIN_MINUTES = 5;

/** Share of one 5-minute bin the cow lay (0 to 1); null when she was not found in it. */
export type Bin = number | null;

export type RuleOptions = {
  /** Bins averaged into "lying time over the last hours". */
  readonly windowBins: number;
  /** Bins at the start of her stay that count as her normal days. */
  readonly baselineBins: number;
  /** Bins in a row below the limit before it counts as a warning. */
  readonly holdBins: number;
};

/** A 6-hour window, two normal days, held for 15 minutes. */
export const DEFAULTS: RuleOptions = { windowBins: 72, baselineBins: 576, holdBins: 3 };

export type Verdict = {
  /** Her lowest window value on her normal days; null until those days are recorded. */
  readonly limit: number | null;
  /** The bin that completed the first warning, and her lying share over the window then. */
  readonly warning: { readonly bin: number; readonly share: number } | null;
};

const seen = (bin: Bin): bin is number => bin !== null;

/** Mean lying share over the window ending at each bin; null when she was seen in under half of it. */
export function rollingShare(bins: readonly Bin[], windowBins: number): Bin[] {
  return bins.map((_, i) => {
    const window = bins.slice(Math.max(0, i - windowBins + 1), i + 1).filter(seen);
    if (window.length < Math.floor(windowBins / 2)) return null;
    return window.reduce((sum, share) => sum + share, 0) / window.length;
  });
}

export function judge(bins: readonly Bin[], options: RuleOptions = DEFAULTS): Verdict {
  if (bins.length < options.baselineBins) return { limit: null, warning: null };
  const rolling = rollingShare(bins, options.windowBins);
  const normal = rolling.slice(0, options.baselineBins).filter(seen);
  if (normal.length === 0) return { limit: null, warning: null };
  const limit = Math.min(...normal);
  let run = 0;
  for (let bin = options.baselineBins; bin < rolling.length; bin++) {
    const share = rolling[bin] ?? null;
    run = share !== null && share < limit ? run + 1 : 0;
    if (share !== null && run === options.holdBins) return { limit, warning: { bin, share } };
  }
  return { limit, warning: null };
}
