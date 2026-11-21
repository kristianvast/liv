import { expect, test } from "bun:test";
import recorded from "./fixtures/calving-2026-11-19.json";
import { BIN_MINUTES, type Bin, DEFAULTS, judge, rollingShare } from "./rule";

const binEnd = (bin: number) =>
  new Date(Date.parse(recorded.start) + (bin + 1) * BIN_MINUTES * 60_000).toISOString();

test("the recorded calving is warned 6 h 03 min ahead on the overhead camera", () => {
  const verdict = judge(recorded.cameras.overhead);
  expect(verdict.limit).toBeCloseTo(0.3969, 3);
  expect(verdict.warning && binEnd(verdict.warning.bin)).toBe("2026-11-19T12:40:00.000Z");
  expect(Date.parse(recorded.birth) - Date.parse("2026-11-19T12:40:00Z")).toBe(363 * 60_000);
});

test("the corner camera warns on the same calving, 4 h 38 min ahead", () => {
  const verdict = judge(recorded.cameras.corner);
  expect(verdict.warning && binEnd(verdict.warning.bin)).toBe("2026-11-19T14:05:00.000Z");
});

test("no warning while her normal days are still being recorded", () => {
  const standingAllDay: Bin[] = Array(DEFAULTS.baselineBins - 1).fill(0);
  expect(judge(standingAllDay)).toEqual({ limit: null, warning: null });
});

test("a cow that is not found is not taken for a cow that stands", () => {
  const normal: Bin[] = Array(DEFAULTS.baselineBins).fill(0.5);
  const notFound: Bin[] = Array(DEFAULTS.windowBins * 2).fill(null);
  expect(judge([...normal, ...notFound]).warning).toBeNull();
  const standing: Bin[] = Array(DEFAULTS.windowBins * 2).fill(0);
  expect(judge([...normal, ...standing]).warning).not.toBeNull();
});

test("the window value is the mean of the bins she was seen in", () => {
  expect(rollingShare([1, null, 0, 1], 4)).toEqual([null, null, 0.5, 2 / 3]);
});
