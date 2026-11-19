import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";
import { useAccount } from "./account";
import { isTauriRuntime } from "./liv";

const INSTALL_KEY = "liv.install.id";
const SENT_KEY = "liv.install.reported";
// One in-flight attempt across React StrictMode mounts. Offline attempts can retry on next launch.
let pending: Promise<void> | undefined;

export function reportFirstLaunch(coreUrl: string): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    try {
      if (localStorage.getItem(SENT_KEY)) return;
      const os = /Win/i.test(navigator.platform)
        ? "windows"
        : /Mac/i.test(navigator.platform)
          ? "macos"
          : /Linux/i.test(navigator.platform)
            ? "linux"
            : null;
      if (!os) return;
      const installId = localStorage.getItem(INSTALL_KEY) ?? crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, installId);
      const appVersion = await getVersion();
      const response = await fetch(`${coreUrl.replace(/\/+$/, "")}/v1/app/first-launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        signal: AbortSignal.timeout(2000),
        body: JSON.stringify({ install_id: installId, os, app_version: appVersion }),
      });
      if (response.ok) localStorage.setItem(SENT_KEY, "1");
    } catch (error) {
      console.warn("Liv first launch report failed", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

export function FirstLaunch() {
  const { status } = useAccount();
  useEffect(() => {
    if (status?.coreUrl) void reportFirstLaunch(status.coreUrl);
  }, [status?.coreUrl]);
  return null;
}
