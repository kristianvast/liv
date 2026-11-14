import { useCallback, useEffect, useState } from "react";
import { useOrion, useOrionEvent } from "./orion";
import { setFirstRun, useFirstRun } from "./tour";

/**
 * True on an install where Orion cannot answer yet: nobody is signed in and no AI model is usable.
 * Null until Orion has answered.
 */
function useNeedsSetup(): boolean | null {
  const { client, state } = useOrion();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  const check = useCallback(() => {
    if (!client || state !== "open") return;
    // An Orion without account support (older sidecar, test mock) never needs this setup.
    Promise.all([client.request("account.status", {}), client.request("settings.get")])
      .then(([account, settings]) =>
        setNeedsSetup(account.state === "signed_out" && settings.availableModels.length === 0),
      )
      .catch(() => setNeedsSetup(false));
  }, [client, state]);

  useEffect(check, [check]);
  useOrionEvent("account.updated", check);
  return needsSetup;
}

/** "setup" while Orion cannot answer yet, "ready" once it can, "unknown" until Orion has said. */
export type SetupState = "unknown" | "setup" | "ready";

/**
 * Whether Orion can be used on this install. While it cannot, Home shows the account form in
 * place of the ask box and the call button, and Chat is held back. An install that was set up
 * before counts as ready while Orion is still starting, so the app does not flicker.
 */
export function useSetupState(): SetupState {
  const needsSetup = useNeedsSetup();
  const firstRun = useFirstRun();

  useEffect(() => {
    if (needsSetup === null || firstRun !== null) return;
    setFirstRun(needsSetup ? "pending" : "done");
  }, [needsSetup, firstRun]);

  if (needsSetup === null) return firstRun === "done" ? "ready" : "unknown";
  return needsSetup ? "setup" : "ready";
}
