import { useCallback, useState } from "react";

/** Liv's speaking voice. The ids are the website demo's voices on ElevenLabs. */
export type LivVoiceChoice = "male" | "female";

export const LIV_VOICE_IDS: Record<LivVoiceChoice, string> = {
  male: "iP95p4xoKVk53GoZ742B",
  female: "EXAVITQu4vr4xnSDxMaL",
};

const STORAGE_KEY = "liv.voice";

export function readVoiceChoice(): LivVoiceChoice {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === "female" ? "female" : "male";
  } catch {
    return "male";
  }
}

export function useVoiceChoice(): readonly [LivVoiceChoice, (next: LivVoiceChoice) => void] {
  const [choice, setChoice] = useState<LivVoiceChoice>(readVoiceChoice);
  const update = useCallback((next: LivVoiceChoice) => {
    setChoice(next);
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this window only.
    }
  }, []);
  return [choice, update] as const;
}
