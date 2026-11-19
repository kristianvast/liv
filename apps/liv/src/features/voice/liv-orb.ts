import { drawOrbScene, type OrbVariant, type TrackedChip } from "./liv-orb-draw";
import { buildSphere, mix, type Rgb, readPalette, stateColor } from "./orb-palette";
import type { ActivityRowView, VoiceCallState } from "./types";

export type { OrbVariant } from "./liv-orb-draw";

const MAX_CHIPS = 6;

// One clock, one spin and one set of tool chips for every orb on screen and after it. An orb
// that is drawn again (the farmer comes back to Home, or the call moves between Home, Chat and
// the dock) carries on where the last one was, instead of launching every tool once more.
const nowSec = () => (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
const tracked = new Map<string, TrackedChip>();
let spin = 0;
let spinAtSec = 0;

/** The chips for these tools, oldest first; a tool seen before keeps its place in time. */
export function trackChips(activities: readonly ActivityRowView[], t: number): TrackedChip[] {
  const chips = activities.slice(-MAX_CHIPS).map((act): TrackedChip => {
    const prev = tracked.get(act.id);
    if (!prev) {
      return {
        id: act.id,
        label: act.chipLabel,
        status: act.status,
        startedAtSec: t,
        endedAtSec: act.status === "running" ? Number.POSITIVE_INFINITY : t,
        dock: 0,
      };
    }
    return {
      ...prev,
      label: act.chipLabel,
      status: act.status,
      endedAtSec: prev.status === "running" && act.status !== "running" ? t : prev.endedAtSec,
    };
  });
  tracked.clear();
  for (const chip of chips) tracked.set(chip.id, chip);
  return chips;
}

export interface LivOrbController {
  update(input: {
    readonly state: VoiceCallState;
    readonly stateLabel: string;
    readonly wordmark: string;
    readonly hudTitle: string;
    readonly hudActions: string;
    readonly level: number;
    readonly activities: readonly ActivityRowView[];
    readonly reducedMotion: boolean;
  }): void;
  refreshTheme(): void;
  destroy(): void;
}

export function createLivOrb(
  canvas: HTMLCanvasElement,
  variant: OrbVariant,
): LivOrbController | null {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return null;
  }
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!ctx) return null;
  const context = ctx;

  const pts = buildSphere(variant === "dock" ? 220 : variant === "widget" ? 560 : 780);
  let palette = readPalette(canvas);
  let currentState: VoiceCallState = "idle";
  let stateLabel = "READY";
  let wordmark = "LIV";
  let hudTitle = "";
  let hudActions = "";
  let targetLevel = 0;
  let smoothLevel = 0;
  let reducedMotion = false;
  let currentCol: Rgb = stateColor("idle", palette);
  let chips: TrackedChip[] = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  let visible = true;
  let raf = 0;

  const paint = (t: number) =>
    drawOrbScene({
      ctx: context,
      palette,
      pts,
      variant,
      w,
      h,
      dpr,
      t,
      spin,
      smoothLevel,
      currentCol,
      currentState,
      stateLabel,
      wordmark,
      hudTitle,
      hudActions,
      reducedMotion,
      chips,
    });

  function tick(): void {
    raf = 0;
    const t = nowSec();
    smoothLevel += (targetLevel - smoothLevel) * (targetLevel > smoothLevel ? 0.35 : 0.09);
    currentCol = mix(currentCol, stateColor(currentState, palette), 0.14);
    const busy = currentState === "working" || chips.some((c) => c.status === "running");
    // Shared by every orb, so two on screen at once do not turn the chips twice as fast.
    spin += Math.min(0.05, Math.max(0, t - spinAtSec)) * (busy ? 0.42 : 0.2);
    spinAtSec = t;
    paint(t);
    if (
      !reducedMotion &&
      visible &&
      !canvas.ownerDocument.hidden &&
      (currentState !== "idle" || smoothLevel > 0.01 || chips.length > 0)
    ) {
      raf = window.requestAnimationFrame(tick);
    }
  }

  function kick(): void {
    if (reducedMotion || currentState === "idle") {
      smoothLevel = reducedMotion ? 0 : targetLevel;
      currentCol = stateColor(currentState, palette);
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      paint(nowSec());
      return;
    }
    if (!raf && visible && !canvas.ownerDocument.hidden) {
      raf = window.requestAnimationFrame(tick);
    }
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    w = rect.width || (variant === "dock" ? 40 : 260);
    h = rect.height || (variant === "dock" ? 40 : 240);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    paint(nowSec());
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting);
          kick();
        })
      : null;
  io?.observe(canvas);
  const doc = canvas.ownerDocument;
  const refreshPalette = () => {
    palette = readPalette(canvas);
    currentCol = stateColor(currentState, palette);
    paint(nowSec());
    kick();
  };
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(refreshPalette) : null;
  mo?.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  doc.addEventListener("visibilitychange", kick);
  resize();

  return {
    update(next) {
      currentState = next.state;
      stateLabel = next.stateLabel;
      wordmark = next.wordmark;
      hudTitle = next.hudTitle;
      hudActions = next.hudActions;
      reducedMotion = next.reducedMotion;
      targetLevel = next.reducedMotion ? 0 : Math.max(0, Math.min(1, next.level));
      chips = trackChips(next.activities, nowSec());
      kick();
    },
    refreshTheme: refreshPalette,
    destroy() {
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      mo?.disconnect();
      doc.removeEventListener("visibilitychange", kick);
    },
  };
}
