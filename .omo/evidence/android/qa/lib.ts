// Shared helpers for the phone relay QA scripts. Sessions and passwords live in STATE (outside
// the repo); nothing here writes a secret into an evidence file.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const CORE = process.env.CORE ?? "http://127.0.0.1:8797";
export const ORION_URL = process.env.ORION_URL ?? "ws://127.0.0.1:7797/ws";
export const ORION_TOKEN = process.env.ORION_TOKEN ?? "qa";
export const STATE = process.env.STATE ?? `${process.env.HOME}/.orbit-qa/android/state.json`;
export const EVIDENCE = new URL("../", import.meta.url).pathname;

export interface Account {
  email: string;
  password: string;
  session?: string;
  userId?: string;
}
export interface QaState {
  owner?: Account;
  outsider?: Account;
  farmId?: string;
}

export function readState(): QaState {
  return existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")) as QaState) : {};
}

export function writeState(state: QaState): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
  chmodSync(STATE, 0o600);
}

export async function core(
  method: string,
  path: string,
  opts: { body?: unknown; session?: string; farm?: string } = {},
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${CORE}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.session ? { authorization: `Bearer ${opts.session}` } : {}),
      ...(opts.farm ? { "x-orbit-farm": opts.farm } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Peer {
  hello: any;
  events: any[];
  request(type: string, params?: Record<string, unknown>): Promise<any>;
  waitFor(match: (event: any) => boolean, ms: number, label: string): Promise<any>;
  close(): void;
  closed: Promise<{ code: number; reason: string }>;
}

export function connect(
  url: string,
  headers: Record<string, string> | undefined,
  helloToken: string,
  timeoutMs = 15_000,
): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, headers ? ({ headers } as never) : undefined);
    const pending = new Map<string, { ok: (v: any) => void; fail: (e: Error) => void }>();
    const waiters = new Set<{ match: (e: any) => boolean; ok: (e: any) => void }>();
    const events: any[] = [];
    let next = 1;
    let opened = false;
    let closeOk: (v: { code: number; reason: string }) => void = () => {};
    const closed = new Promise<{ code: number; reason: string }>((ok) => {
      closeOk = ok;
    });
    const timer = setTimeout(() => {
      reject(new Error(`no hello answer from ${url} within ${timeoutMs} ms`));
      ws.close();
    }, timeoutMs);

    const request = (type: string, params: Record<string, unknown> = {}) =>
      new Promise<any>((ok, fail) => {
        const id = String(next++);
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ ...params, id, type }));
      });

    const peer: Peer = {
      hello: null,
      events,
      request,
      waitFor(match, ms, label) {
        const seen = events.find(match);
        if (seen) return Promise.resolve(seen);
        return new Promise((ok, fail) => {
          const waiter = {
            match,
            ok: (event: any) => {
              clearTimeout(limit);
              ok(event);
            },
          };
          const limit = setTimeout(() => {
            waiters.delete(waiter);
            fail(new Error(`timed out after ${ms} ms waiting for ${label}`));
          }, ms);
          waiters.add(waiter);
        });
      },
      close: () => ws.close(),
      closed,
    };

    ws.addEventListener("open", () => {
      opened = true;
      request("hello", { token: helloToken, protocolVersion: 1 }).then((hello) => {
        clearTimeout(timer);
        peer.hello = hello;
        resolve(peer);
      }, reject);
    });
    ws.addEventListener("message", (message) => {
      const frame = JSON.parse(String(message.data));
      if (frame.type === "response") {
        const waiting = pending.get(frame.id);
        pending.delete(frame.id);
        if (!waiting) return;
        if (frame.ok) waiting.ok(frame.result);
        else waiting.fail(new RequestError(frame.error?.code ?? "unknown", frame.error?.message ?? ""));
        return;
      }
      events.push(frame);
      for (const waiter of [...waiters]) {
        if (waiter.match(frame)) {
          waiters.delete(waiter);
          waiter.ok(frame);
        }
      }
    });
    ws.addEventListener("close", (event) => {
      clearTimeout(timer);
      const info = { code: event.code, reason: event.reason };
      closeOk(info);
      const error = new Error(`socket closed (${info.code} ${info.reason})`);
      for (const waiting of pending.values()) waiting.fail(error);
      pending.clear();
      if (!opened || !peer.hello) reject(error);
    });
  });
}

export const relayUrl = (query = "") =>
  `${CORE.replace(/^http/, "ws")}/v1/relay/client${query ? `?${query}` : ""}`;

export const relayHeaders = (session: string, farm: string) => ({
  authorization: `Bearer ${session}`,
  "x-orbit-farm": farm,
});

/** Waits until Core reports the PC online or offline; the status route is the only observable. */
export async function waitRelay(session: string, farm: string, online: boolean, ms = 30_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const res = await core("GET", "/v1/relay/status", { session, farm });
    if (res.status === 200 && res.json?.online === online) return;
    if (Date.now() > deadline) {
      throw new Error(`relay status never became online=${online} (last ${res.status} ${res.text})`);
    }
    await Bun.sleep(250);
  }
}
