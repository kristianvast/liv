import { ArrowUp, CornerDownRight, Loader2, Mic, PhoneOff, Square, Zap } from "lucide-react";
import { type KeyboardEvent, type RefObject, useLayoutEffect } from "react";
import { useT } from "../../i18n";
import type { QueuedMessage } from "./reducer";

/** While Liv works, a message waits as a follow-up; prompt starts a new run. */
export type SendMode = "prompt" | "followUp";

const MAX_COMPOSER_PX = 224;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (mode: SendMode) => void;
  onSteer: (message: QueuedMessage) => void;
  onStop: () => void;
  onStartVoice?: () => void;
  voiceOpen?: boolean;
  streaming: boolean;
  sendingPrompt: boolean;
  queued: QueuedMessage[];
  modelLabel: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({
  value,
  onChange,
  onSend,
  onSteer,
  onStop,
  onStartVoice,
  voiceOpen = false,
  streaming,
  sendingPrompt,
  queued,
  modelLabel,
  inputRef,
}: ComposerProps) {
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  });

  const t = useT();
  const canSend = value.trim().length > 0 && (voiceOpen || streaming || !sendingPrompt);
  const send = () => onSend(voiceOpen || !streaming ? "prompt" : "followUp");

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (canSend) send();
  };

  return (
    <div className="liv-composer-wrap">
      {queued.length > 0 && (
        <ul
          className="liv-queue"
          data-testid="queued-messages"
          aria-label={t("chat.composer.queueLabel")}
        >
          {queued.map((q) => (
            <li key={q.id} className="liv-queue__item" data-testid="queued-message">
              <span className="liv-queue__mode" data-mode={q.mode}>
                {q.mode === "steer" ? (
                  <Zap size={12} aria-hidden="true" />
                ) : (
                  <CornerDownRight size={12} aria-hidden="true" />
                )}
                {q.mode === "steer" ? t("chat.composer.steering") : t("chat.composer.queued")}
              </span>
              <span className="liv-queue__text">{q.text}</span>
              {q.mode === "followUp" && (
                <button
                  type="button"
                  className="liv-queue__steer"
                  onClick={() => onSteer(q)}
                  title={t("chat.composer.steerTitle")}
                  data-testid="queued-message-steer"
                >
                  <Zap size={12} aria-hidden="true" />
                  {t("chat.composer.steer")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="liv-composer" data-streaming={streaming ? "true" : "false"}>
        <label htmlFor="liv-composer-input" className="liv-visually-hidden">
          {t("chat.composer.label")}
        </label>
        <textarea
          id="liv-composer-input"
          ref={inputRef}
          rows={1}
          className="liv-composer__input"
          placeholder={
            voiceOpen
              ? t("voice.composer.placeholder")
              : streaming
                ? t("chat.composer.placeholderStreaming")
                : t("chat.composer.placeholder")
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="chat-composer-input"
        />

        <div className="liv-composer__bar">
          <div className="liv-composer__meta">
            {modelLabel && (
              <span className="liv-composer__model" data-testid="composer-model">
                {modelLabel}
              </span>
            )}
          </div>

          <div className="liv-composer__actions">
            {onStartVoice && (
              <button
                type="button"
                className="liv-composer__chip"
                aria-pressed={voiceOpen}
                aria-label={t(voiceOpen ? "voice.action.end" : "voice.action.start")}
                title={t(voiceOpen ? "voice.action.end" : "voice.action.start")}
                onClick={onStartVoice}
                data-testid="chat-voice-button"
              >
                {voiceOpen ? (
                  <PhoneOff size={13} aria-hidden="true" />
                ) : (
                  <Mic size={13} aria-hidden="true" />
                )}
                {t(voiceOpen ? "voice.action.end" : "voice.action.start")}
              </button>
            )}
            {streaming && !voiceOpen ? (
              <>
                {canSend && (
                  <button
                    type="button"
                    className="liv-composer__round"
                    onClick={send}
                    aria-label={t("chat.composer.queueLabel")}
                    title={t("chat.composer.queueTitle")}
                    data-testid="chat-send-button"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="liv-composer__round liv-composer__round--stop"
                  onClick={onStop}
                  aria-label={t("chat.composer.stopLabel")}
                  title={t("chat.composer.stop")}
                  data-testid="chat-composer-stop-button"
                >
                  <Square size={12} fill="currentColor" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="liv-composer__round"
                disabled={!canSend}
                onClick={send}
                aria-label={t("chat.composer.sendLabel")}
                title={t("chat.composer.sendTitle")}
                data-testid="chat-send-button"
              >
                {sendingPrompt ? (
                  <Loader2 size={16} className="liv-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp size={16} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
