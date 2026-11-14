import { useCallback, useEffect, useState } from "react";
import { useOrion, useOrionEvent } from "./orion";

/**
 * True on an install where Orion cannot answer yet: nobody is signed in and no AI model is usable.
 * Null until Orion has answered.
 */
export function useNeedsSetup(): boolean | null {
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
