import { ArrowUp, Loader2, Mic, PhoneOff, Square } from "lucide-react";
import { type KeyboardEvent, type RefObject, useLayoutEffect } from "react";
import { useT } from "../../i18n";

const MAX_COMPOSER_PX = 224;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onStartVoice?: () => void;
  voiceOpen?: boolean;
  streaming: boolean;
  sendingPrompt: boolean;
  modelLabel: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onStartVoice,
  voiceOpen = false,
  streaming,
  sendingPrompt,
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
  const canSend = value.trim().length > 0 && (voiceOpen || (!streaming && !sendingPrompt));

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div className="orbit-composer-wrap">
      <div className="orbit-composer" data-streaming={streaming ? "true" : "false"}>
        <label htmlFor="orion-composer-input" className="orbit-visually-hidden">
          {t("chat.composer.label")}
        </label>
        <textarea
          id="orion-composer-input"
          ref={inputRef}
          rows={1}
          className="orbit-composer__input"
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

        <div className="orbit-composer__bar">
          <div className="orbit-composer__meta">
            {modelLabel && (
              <span className="orbit-composer__model" data-testid="composer-model">
                {modelLabel}
              </span>
            )}
          </div>

          <div className="orbit-composer__actions">
            {onStartVoice && (
              <button
                type="button"
                className="orbit-composer__chip"
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
              <button
                type="button"
                className="orbit-composer__round orbit-composer__round--stop"
                onClick={onStop}
                aria-label={t("chat.composer.stopLabel")}
                title={t("chat.composer.stop")}
                data-testid="chat-composer-stop-button"
              >
                <Square size={12} fill="currentColor" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="orbit-composer__round"
                disabled={!canSend}
                onClick={onSend}
                aria-label={t("chat.composer.sendLabel")}
                title={t("chat.composer.sendTitle")}
                data-testid="chat-send-button"
              >
                {sendingPrompt ? (
                  <Loader2 size={16} className="orbit-spin" aria-hidden="true" />
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
