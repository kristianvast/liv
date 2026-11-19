import {
  type ConnectionState,
  createLivClient,
  type DbQueryName,
  type DbQueryParams,
  type DbQueryResults,
  DEV_SERVER_URL,
  DEV_TOKEN,
  type EventFrame,
  type EventType,
  type LivClient,
  type ServerEvent,
} from "@liv/protocol";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { localUiEndpoint } from "./local-ui-path";

export interface LivEndpoint {
  url: string;
  token: string;
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

export type ShellLivStatus =
  | { kind: "ready"; endpoint: LivEndpoint }
  | { kind: "starting" }
  | { kind: "stopped"; reason: string };

/** The desktop shell rejects `liv_endpoint` with `starting` or `stopped: <reason>`. */
export function parseShellLivError(error: unknown): ShellLivStatus {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return text.startsWith("stopped: ")
    ? { kind: "stopped", reason: text.slice("stopped: ".length) }
    : { kind: "starting" };
}

async function readShellLiv(): Promise<ShellLivStatus> {
  try {
    const endpoint = await invoke<LivEndpoint>("liv_endpoint");
    return endpoint?.url && endpoint?.token ? { kind: "ready", endpoint } : { kind: "starting" };
  } catch (error) {
    return parseShellLivError(error);
  }
}

export class LivStoppedError extends Error {
  override name = "LivStoppedError";
}

export async function resolveLivEndpoint(): Promise<LivEndpoint> {
  const local = localUiEndpoint();
  if (local) return local;
  if (isTauriRuntime()) {
    for (;;) {
      const status = await readShellLiv();
      if (status.kind === "ready") return status.endpoint;
      if (status.kind === "stopped") throw new LivStoppedError(status.reason);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const envUrl = import.meta.env?.VITE_LIV_URL as string | undefined;
  const envToken = import.meta.env?.VITE_LIV_TOKEN as string | undefined;

  return {
    url: envUrl && envUrl.length > 0 ? envUrl : DEV_SERVER_URL,
    token: envToken && envToken.length > 0 ? envToken : DEV_TOKEN,
  };
}

export const OUT_OF_SYNC_THRESHOLD_MS = 3 * 60_000;

export type SyncNoticeKind = "local_waiting" | "sync_error" | "out_of_sync" | null;

export interface SyncStatusSnapshot {
  state: EventFrame<"sync.status">["state"];
  pendingOutbox: number;
  lastSyncedAt: string | null;
  error?: string;
  unhealthySinceMs?: number | null;
}

export function resolveSyncNotice(
  connState: ConnectionState,
  syncStatus: SyncStatusSnapshot,
  nowMs = Date.now(),
): SyncNoticeKind {
  if (connState !== "open") return "local_waiting";
  if (syncStatus.state === "error") return "sync_error";
  if (syncStatus.state === "disabled" || syncStatus.state === "up_to_date") return null;

  const since = syncStatus.unhealthySinceMs ?? null;
  if (since !== null && nowMs - since >= OUT_OF_SYNC_THRESHOLD_MS) {
    return "out_of_sync";
  }

  if (
    syncStatus.state === "offline" &&
    syncStatus.pendingOutbox > 0 &&
    syncStatus.lastSyncedAt !== null
  ) {
    const lastMs = Date.parse(syncStatus.lastSyncedAt);
    if (Number.isFinite(lastMs) && nowMs - lastMs >= OUT_OF_SYNC_THRESHOLD_MS) {
      return "out_of_sync";
    }
  }

  return null;
}

export function calmAccountSyncState(
  syncStatus: SyncStatusSnapshot,
  nowMs = Date.now(),
): SyncStatusSnapshot["state"] {
  if (
    (syncStatus.state === "syncing" || syncStatus.state === "connecting") &&
    syncStatus.lastSyncedAt !== null &&
    syncStatus.pendingOutbox === 0
  ) {
    return "up_to_date";
  }
  if (syncStatus.state === "offline" && syncStatus.lastSyncedAt !== null) {
    const since = syncStatus.unhealthySinceMs ?? null;
    if (since === null || nowMs - since < OUT_OF_SYNC_THRESHOLD_MS) {
      return "up_to_date";
    }
  }
  return syncStatus.state;
}

export interface LivContextValue {
  client: LivClient | null;
  state: ConnectionState;
  endpoint: LivEndpoint | null;
  syncStatus: SyncStatusSnapshot;
  reconnect: () => void;
  /** Desktop only: why the Liv sidecar is not running after the shell gave up restarting it. */
  stopped: string | null;
  restart: () => void;
}

const DEFAULT_SYNC_STATUS: SyncStatusSnapshot = {
  state: "up_to_date",
  pendingOutbox: 0,
  lastSyncedAt: null,
  unhealthySinceMs: null,
};

function nextSyncSnapshot(
  prev: SyncStatusSnapshot,
  ev: EventFrame<"sync.status">,
  nowMs = Date.now(),
): SyncStatusSnapshot {
  let unhealthySinceMs: number | null = null;
  if (ev.state === "offline" || ev.state === "error") {
    unhealthySinceMs = prev.unhealthySinceMs ?? nowMs;
  } else if (
    (ev.state === "syncing" || ev.state === "connecting") &&
    prev.unhealthySinceMs != null
  ) {
    unhealthySinceMs = prev.unhealthySinceMs;
  }
  return {
    state: ev.state,
    pendingOutbox: ev.pendingOutbox,
    lastSyncedAt: ev.lastSyncedAt,
    error: ev.error,
    unhealthySinceMs,
  };
}

const LivContext = createContext<LivContextValue | null>(null);

export interface LivProviderProps {
  children: ReactNode;
  initialClient?: LivClient;
  initialEndpoint?: LivEndpoint;
}

export function LivProvider({ children, initialClient, initialEndpoint }: LivProviderProps) {
  const [client, setClient] = useState<LivClient | null>(initialClient ?? null);
  const [endpoint, setEndpoint] = useState<LivEndpoint | null>(initialEndpoint ?? null);
  const [state, setState] = useState<ConnectionState>(
    initialClient ? initialClient.state : "connecting",
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(DEFAULT_SYNC_STATUS);
  const [connectEpoch, setConnectEpoch] = useState(0);
  const [stopped, setStopped] = useState<string | null>(null);

  useEffect(() => {
    void connectEpoch;
    if (initialClient) {
      setClient(initialClient);
      setState(initialClient.state);
      const offState = initialClient.onState((next) => setState(next));
      const offSync = initialClient.on("sync.status", (ev) => {
        setSyncStatus((prev) => nextSyncSnapshot(prev, ev));
      });
      return () => {
        offState();
        offSync();
      };
    }

    let cancelled = false;
    let activeClient: LivClient | null = null;
    let offState: (() => void) | null = null;
    let offSync: (() => void) | null = null;
    let shellWatch: ReturnType<typeof setInterval> | null = null;

    // A restarted sidecar listens on a new port with a new token, so the old client can never
    // reconnect: while it retries, ask the shell for the current endpoint and switch to it.
    const watchShell = (current: LivEndpoint) => {
      if (shellWatch || !isTauriRuntime() || localUiEndpoint()) return;
      shellWatch = setInterval(() => {
        void readShellLiv().then((status) => {
          if (cancelled) return;
          if (status.kind === "stopped") setStopped(status.reason);
          if (
            status.kind === "ready" &&
            (status.endpoint.url !== current.url || status.endpoint.token !== current.token)
          ) {
            setConnectEpoch((n) => n + 1);
          }
        });
      }, 1000);
    };
    const stopWatch = () => {
      if (shellWatch) clearInterval(shellWatch);
      shellWatch = null;
    };

    resolveLivEndpoint().then(
      (resolved) => {
        if (cancelled) return;
        setStopped(null);
        setEndpoint(resolved);
        const created = createLivClient(resolved.url, resolved.token, {
          clientName: "@liv/app",
        });
        activeClient = created;
        setClient(created);
        setState(created.state);
        offState = created.onState((next) => {
          if (cancelled) return;
          setState(next);
          if (next === "reconnecting") watchShell(resolved);
          else stopWatch();
        });
        offSync = created.on("sync.status", (ev) => {
          if (!cancelled) {
            setSyncStatus((prev) => nextSyncSnapshot(prev, ev));
          }
        });
      },
      (error: unknown) => {
        if (!cancelled && error instanceof LivStoppedError) setStopped(error.message);
      },
    );

    return () => {
      cancelled = true;
      stopWatch();
      offState?.();
      offSync?.();
      activeClient?.close();
    };
  }, [initialClient, connectEpoch]);

  const reconnect = useCallback(() => {
    setConnectEpoch((n) => n + 1);
  }, []);

  const restart = useCallback(() => {
    setStopped(null);
    invoke("liv_restart").then(
      () => setConnectEpoch((n) => n + 1),
      (error: unknown) => setStopped(String(error)),
    );
  }, []);

  const value = useMemo<LivContextValue>(
    () => ({
      client,
      state,
      endpoint,
      syncStatus,
      reconnect,
      stopped,
      restart,
    }),
    [client, state, endpoint, syncStatus, reconnect, stopped, restart],
  );

  return createElement(LivContext.Provider, { value }, children);
}

export function useLiv(): LivContextValue {
  const ctx = useContext(LivContext);
  if (!ctx) {
    throw new Error("useLiv must be used within an <LivProvider>");
  }
  return ctx;
}

export function useLivEvent<E extends EventType>(
  type: E,
  handler: (event: EventFrame<E>) => void,
): void;
export function useLivEvent(type: "*", handler: (event: ServerEvent) => void): void;
export function useLivEvent(type: EventType | "*", handler: (event: never) => void): void {
  const { client } = useLiv();
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    if (!client) return;
    const listener = (ev: never) => {
      savedHandler.current(ev);
    };
    if (type === "*") {
      return client.on("*", listener as (event: ServerEvent) => void);
    }
    return client.on(type, listener as (event: EventFrame<EventType>) => void);
  }, [client, type]);
}

export interface UseLivQueryOptions {
  enabled?: boolean;
  refetchTables?: string[];
}

export interface UseLivQueryResult<Q extends DbQueryName> {
  data: DbQueryResults[Q] | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useLivQuery<Q extends DbQueryName>(
  query: Q,
  params?: DbQueryParams<Q>,
  options: UseLivQueryOptions = {},
): UseLivQueryResult<Q> {
  const { client, state } = useLiv();
  const enabled = options.enabled ?? true;
  const serializedParams = JSON.stringify(params ?? {});
  const [data, setData] = useState<DbQueryResults[Q] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async () => {
    if (!client || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const parsedParams = JSON.parse(serializedParams) as DbQueryParams<Q>;
      const result = await client.query(query, parsedParams);
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [client, enabled, query, serializedParams]);

  useEffect(() => {
    if (!enabled || !client) return;
    if (state === "open" || state === "connecting") {
      void execute();
    }
  }, [client, enabled, state, execute]);

  useEffect(() => {
    if (!client || !enabled) return;
    return client.on("db.changed", (ev) => {
      if (
        !options.refetchTables ||
        options.refetchTables.length === 0 ||
        options.refetchTables.includes(ev.table)
      ) {
        void execute();
      }
    });
  }, [client, enabled, execute, options.refetchTables]);

  return {
    data,
    error,
    loading,
    refetch: execute,
  };
}
