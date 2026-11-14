import { ArrowRight, Check, Hammer, MessageSquare, Mic, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../design";
import { type MessageKey, useT } from "../../i18n";
import { markTourSeen } from "../../lib/tour";

interface TourStep {
  readonly id: "text" | "talk" | "build";
  readonly icon: typeof Mic;
  /** The first of these found on Home is the control the step points at. */
  readonly targets: readonly string[];
  readonly titleKey: MessageKey;
  readonly bodyKey: MessageKey;
}

const STEPS: readonly [TourStep, TourStep, TourStep] = [
  {
    id: "text",
    icon: MessageSquare,
    targets: ['[data-testid="home-ask-input"]'],
    titleKey: "home.tour.text.title",
    bodyKey: "home.tour.text.body",
  },
  {
    id: "talk",
    icon: Mic,
    targets: ['[data-testid="home-voice-start"]'],
    titleKey: "home.tour.talk.title",
    bodyKey: "home.tour.talk.body",
  },
  {
    id: "build",
    icon: Hammer,
    targets: ['[data-testid="home-starter-chips"]', '[data-testid="home-orion-widget"]'],
    titleKey: "home.tour.build.title",
    bodyKey: "home.tour.build.body",
  },
];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const PAD = 6;
const CARD_GAP = 14;

function findTarget(targets: readonly string[]): Element | null {
  for (const selector of targets) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Where the step's control is on screen. Read every frame while the tour is open: Home keeps
 * settling after it appears (fonts, the orb, data arriving), and none of that announces itself.
 */
function useTargetBox(targets: readonly string[]): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const rect = findTarget(targets)?.getBoundingClientRect();
      setBox((prev) => {
        if (!rect) return null;
        const next = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        return prev &&
          prev.x === next.x &&
          prev.y === next.y &&
          prev.w === next.w &&
          prev.h === next.h
          ? prev
          : next;
      });
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [targets]);

  return box;
}

/** Three short stops on Home, once: write to Orion, talk to it, build with it. */
export function Tour() {
  const t = useT();
  const [index, setIndex] = useState(0);
  const step = STEPS[index] ?? STEPS[0];
  const box = useTargetBox(step.targets);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const last = index === STEPS.length - 1;
  const finish = markTourSeen;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") markTourSeen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = box !== null;
  useLayoutEffect(() => {
    void index;
    if (!shown) return;
    setCardHeight(cardRef.current?.offsetHeight ?? 0);
    cardRef.current?.focus();
  }, [index, shown]);

  if (!box) return null;

  const Icon = step.icon;
  const cardWidth = Math.min(352, window.innerWidth - 32);
  const below = box.y + box.h + PAD + CARD_GAP;
  const top =
    below + cardHeight <= window.innerHeight - 16
      ? below
      : Math.max(16, box.y - PAD - CARD_GAP - cardHeight);
  const left = Math.max(
    16,
    Math.min(window.innerWidth - cardWidth - 16, box.x + box.w / 2 - cardWidth / 2),
  );

  return (
    <div className="orbit-tour" data-testid="tour" data-step={step.id}>
      <div
        className="orbit-tour__spot"
        data-testid="tour-spot"
        style={{
          left: box.x - PAD,
          top: box.y - PAD,
          width: box.w + PAD * 2,
          height: box.h + PAD * 2,
        }}
      />
      <div
        ref={cardRef}
        className="orbit-tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orbit-tour-title"
        tabIndex={-1}
        style={{ left, top, width: cardWidth }}
      >
        <button
          type="button"
          className="orbit-tour__close"
          aria-label={t("home.tour.skip")}
          title={t("home.tour.skip")}
          onClick={finish}
          data-testid="tour-skip"
        >
          <X size={16} aria-hidden="true" />
        </button>
        <span className="orbit-tour__icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <h2 id="orbit-tour-title" className="orbit-tour__title">
          {t(step.titleKey)}
        </h2>
        <p className="orbit-tour__body">{t(step.bodyKey)}</p>
        <div className="orbit-tour__foot">
          <ol className="orbit-tour__dots" aria-label={t("home.tour.progress")}>
            {STEPS.map((s, i) => (
              <li key={s.id} data-current={i === index ? "true" : undefined} />
            ))}
          </ol>
          <Button
            variant="primary"
            size="sm"
            icon={last ? <Check size={15} /> : <ArrowRight size={15} />}
            onClick={last ? finish : () => setIndex(index + 1)}
            data-testid="tour-next"
          >
            {t(last ? "home.tour.done" : "home.tour.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
