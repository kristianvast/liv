import { useCallback, useEffect, useState } from "react";
import { useLiv, useLivEvent } from "./liv";
import { useTourSeen } from "./tour";

/**
 * True on an install where Liv cannot answer yet: nobody is signed in and no AI model is usable.
 * Null until Liv has answered.
 */
function useNeedsSetup(): boolean | null {
  const { client, state } = useLiv();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  const check = useCallback(() => {
    if (!client || state !== "open") return;
    // A Liv without account support (older sidecar, test mock) never needs this setup.
    Promise.all([client.request("account.status", {}), client.request("settings.get")])
      .then(([account, settings]) =>
        setNeedsSetup(account.state === "signed_out" && settings.availableModels.length === 0),
      )
      .catch(() => setNeedsSetup(false));
  }, [client, state]);

  useEffect(check, [check]);
  useLivEvent("account.updated", check);
  return needsSetup;
}

/** "setup" while Liv cannot answer yet, "ready" once it can, "unknown" until Liv has said. */
export type SetupState = "unknown" | "setup" | "ready";

/**
 * Whether Liv can be used on this install. While it cannot, Home shows the account form in
 * place of the ask box and the call button, and Chat is held back. A computer where the tour has
 * been seen counts as ready while Liv is still starting, so the app does not flicker.
 */
export function useSetupState(): SetupState {
  const needsSetup = useNeedsSetup();
  const tourSeen = useTourSeen();

  if (needsSetup === null) return tourSeen ? "ready" : "unknown";
  return needsSetup ? "setup" : "ready";
}
