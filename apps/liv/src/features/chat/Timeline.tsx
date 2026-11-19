import type { AssistantItem, ToolItem, TranscriptItem } from "@liv/protocol";
import { AlertCircle, Brain, Check, ChevronRight, Copy, Mic, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { SafeMarkdown } from "./markdown";
import { getFriendlyToolMeta, summarizeToolArgs, ToolCard } from "./ToolCard";
import {
  buildTurnBlocks,
  buildTurns,
  collapseToolRuns,
  formatElapsed,
  selectLiveTool,
  splitTurnWork,
  summarizeToolGroup,
  type Turn,
  turnDurationMs,
} from "./turns";

function useElapsedLabel(since: string | null, active: boolean): string {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const start = since ? Date.parse(since) : Number.NaN;
  if (Number.isNaN(start)) return t("chat.timeline.working");
  return t("chat.timeline.workingFor", { elapsed: formatElapsed(Math.max(0, now - start), t) });
}

function WorkingLine({ since }: { since: string | null }) {
  const label = useElapsedLabel(since, true);
  return (
    <div className="liv-working" data-testid="thinking-indicator" aria-live="polite">
      <span className="liv-working__pulse" aria-hidden="true" />
      <span className="liv-working__label">{label}</span>
    </div>
  );
}

function WorkedFor({ ms }: { ms: number }) {
  const t = useT();
  return (
    <div className="liv-worked" data-testid="turn-worked-for">
      <span>{t("chat.timeline.workedFor", { elapsed: formatElapsed(ms, t) })}</span>
    </div>
  );
}

/**
 * All of a turn's work in one fold: while Liv works it shows the latest command's description,
 * and the commands themselves only when the farmer opens it.
 */
function WorkGroup({
  steps,
  live,
  since,
}: {
  steps: Turn["steps"];
  live: boolean;
  since: string | null;
}) {
  const t = useT();
  const tools = steps.filter((step): step is ToolItem => step.kind === "tool");
  const isLiveRunning = live || tools.some((tool) => tool.status === "running");
  const elapsed = useElapsedLabel(since, isLiveRunning);
  const [expanded, setOpen] = useState(false);

  const activeTool = selectLiveTool(tools);
  const activeMeta = activeTool ? getFriendlyToolMeta(t, activeTool.name, activeTool.label) : null;
  const activeArg = activeTool ? summarizeToolArgs(activeTool.name, activeTool.args, t) : "";
  const liveText = activeMeta
    ? activeArg
      ? `${activeMeta.runningTitle} - ${activeArg}`
      : activeMeta.runningTitle
    : "";

  const summary = summarizeToolGroup(tools);
  const kindSummary = summary.kinds.map((k) => t(k.labelKey, { count: k.count })).join(", ");
  const blocks = buildTurnBlocks(steps);

  return (
    <div className="liv-tools" data-expanded={expanded ? "true" : "false"}>
      <button
        type="button"
        className="liv-tools__summary"
        aria-expanded={expanded}
        onClick={() => setOpen((v) => !v)}
        data-testid="tool-group-toggle"
      >
        {isLiveRunning ? (
          <>
            <span className="liv-working__pulse" aria-hidden="true" />
            <span className="liv-working__label" data-testid="thinking-indicator">
              {elapsed}
            </span>
            {liveText && (
              <>
                <span className="liv-tools__sep" aria-hidden="true">
                  -
                </span>
                <span className="liv-tools__live" data-testid="tool-group-live">
                  {liveText}
                </span>
              </>
            )}
          </>
        ) : (
          <>
            <Wrench size={13} aria-hidden="true" />
            <span className="liv-tools__count tabular-nums" data-testid="tool-group-steps">
              {t("chat.timeline.steps", { count: summary.total })}
            </span>
            <span className="liv-tools__sep" aria-hidden="true">
              -
            </span>
            <span className="liv-tools__names" data-testid="tool-group-kinds">
              {kindSummary}
            </span>
            {summary.failed > 0 && (
              <span className="liv-tools__failed tabular-nums" data-testid="tool-group-failed">
                {t("chat.timeline.didNotWork", { count: summary.failed })}
              </span>
            )}
          </>
        )}
        <ChevronRight size={14} className="liv-tools__chevron" aria-hidden="true" />
      </button>
      {expanded && (
        <div className="liv-tools__list" data-testid="tool-group-list">
          {blocks.map((block) =>
            block.kind === "tools" ? (
              collapseToolRuns(block.tools, (tool) =>
                summarizeToolArgs(tool.name, tool.args, t),
              ).map((run) => <ToolCard key={run.key} item={run.item} repeatCount={run.count} />)
            ) : block.item.kind === "assistant" ? (
              <AssistantMessage key={block.item.id} item={block.item} />
            ) : (
              <div
                key={block.item.id}
                className="liv-msg-system"
                data-testid={`message-system-${block.item.id}`}
              >
                {block.item.text}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="liv-msg-action"
      title={t("chat.timeline.copy")}
      aria-label={t("chat.timeline.copyReply")}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

function AssistantMessage({ item }: { item: AssistantItem }) {
  const t = useT();
  if (!item.text && !item.thinking && !item.errorMessage) return null;
  return (
    <article
      className="liv-msg-assistant"
      data-testid={`message-assistant-${item.id}`}
      data-voice={item.voice ? "true" : undefined}
    >
      {item.voice && (
        <span
          className="liv-msg-voice-mark"
          role="img"
          title={t("voice.spokenTurn")}
          aria-label={t("voice.spokenTurn")}
          data-testid="message-voice-mark"
        >
          <Mic size={12} aria-hidden="true" />
        </span>
      )}
      {item.thinking && (
        <details className="liv-thinking" data-testid={`message-thinking-${item.id}`}>
          <summary>
            <Brain size={13} aria-hidden="true" />
            {t("chat.timeline.thinking")}
          </summary>
          <p>{item.thinking}</p>
        </details>
      )}
      {item.text && <SafeMarkdown text={item.text} />}
      {item.errorMessage && (
        <div className="liv-msg-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {item.errorMessage}
        </div>
      )}
      {item.text && (
        <div className="liv-msg-actions">
          <CopyButton text={item.text} />
        </div>
      )}
    </article>
  );
}

function TurnView({
  turn,
  live,
  runStartedAt,
}: {
  turn: Turn;
  live: boolean;
  runStartedAt: string | null;
}) {
  const t = useT();
  const { work, after } = splitTurnWork(turn.steps);
  const duration = live ? null : turnDurationMs(turn);
  const finalReplyIdx = after.findLastIndex((s) => s.kind === "assistant" && Boolean(s.text));
  const markerAt = duration === null ? -1 : finalReplyIdx >= 0 ? finalReplyIdx : after.length;
  const user = turn.user;

  return (
    <section className="liv-turn" data-testid={`turn-${turn.id}`}>
      {user?.text && (
        <article
          className="liv-msg-user"
          data-testid={`message-user-${user.id}`}
          data-voice={user.voice ? "true" : undefined}
        >
          <div className="liv-msg-user__bubble">
            {user.voice && (
              <span
                className="liv-msg-voice-mark"
                role="img"
                title={t("voice.spokenTurn")}
                aria-label={t("voice.spokenTurn")}
                data-testid="message-voice-mark"
              >
                <Mic size={12} aria-hidden="true" />
              </span>
            )}
            {user.text}
          </div>
        </article>
      )}
      {work.length > 0 && (
        <div className="liv-turn__block">
          <WorkGroup steps={work} live={live} since={runStartedAt} />
        </div>
      )}
      {after.map((step, i) => (
        <div key={step.id} className="liv-turn__block">
          {i === markerAt && duration !== null && <WorkedFor ms={duration} />}
          {step.kind === "assistant" ? (
            <AssistantMessage item={step} />
          ) : step.kind === "system" ? (
            <div className="liv-msg-system" data-testid={`message-system-${step.id}`}>
              {step.text}
            </div>
          ) : null}
        </div>
      ))}
      {markerAt === after.length && duration !== null && <WorkedFor ms={duration} />}
      {live && work.length === 0 && <WorkingLine since={runStartedAt} />}
    </section>
  );
}

export interface TimelineProps {
  items: TranscriptItem[];
  streaming: boolean;
  runStartedAt: string | null;
}

export function Timeline({ items, streaming, runStartedAt }: TimelineProps) {
  const turns = buildTurns(items);
  return (
    <div className="liv-timeline">
      {turns.map((turn, i) => (
        <TurnView
          key={turn.id}
          turn={turn}
          live={streaming && i === turns.length - 1}
          runStartedAt={runStartedAt}
        />
      ))}
      {streaming && turns.length === 0 && <WorkingLine since={runStartedAt} />}
    </div>
  );
}
