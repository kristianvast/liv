import { onTestFinished } from "bun:test";
import { createOrionClient, type OrionClient } from "@orbit/protocol/client";
import type { ServerWebSocket } from "bun";
import { MOCK_MODEL, MOCK_PROVIDER } from "../src/agent/mock-model";
import { startOrion } from "../src/app";
import { connect, removeDir, TOKEN, tempDir } from "./helpers";

/** Event mailbox: records early arrivals and bounds every asynchronous read. */
export class Mailbox<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(value: T) => void> = [];
  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(value);
    else this.values.push(value);
  }
  next(): Promise<T> {
    const value = this.values.shift();
    if (value !== undefined) return Promise.resolve(value);
    return new Promise((resolve, reject) => {
      const receive = (item: T) => {
        clearTimeout(timer);
        resolve(item);
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(receive);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for phone event"));
      }, 10_000);
      this.waiters.push(receive);
    });
  }
}

type Peer =
  | { readonly kind: "host" }
  | { readonly kind: "phone"; readonly ch: string; readonly voiceId: string | null };
type CloseEnvelope = { readonly ch: string; readonly code: number };

export async function phoneFixture(linkedFarm = true) {
  const dir = tempDir();
  const hosts = new Mailbox<ServerWebSocket<Peer>>();
  const closed = new Mailbox<CloseEnvelope>();
  const hostClosed = new Mailbox<number>();
  const notifications = new Mailbox<unknown>();
  const receivedNotifications: unknown[] = [];
  const clients = new Set<OrionClient>();
  const rawSockets = new Set<WebSocket>();
  const phones = new Map<string, ServerWebSocket<Peer>>();
  let host: ServerWebSocket<Peer> | null = null;
  let farmId = "";
  let attempts = 0;
  let notifyStatus = 204;
  const user = { id: "phone-user", email: "phone@example.test", name: "Phone tester" };
  const core = Bun.serve<Peer>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/v1/relay/host") {
        attempts++;
        if (
          request.headers.get("authorization") !== "Bearer orb_s_phone" ||
          request.headers.get("x-orbit-farm") !== farmId
        )
          return new Response("unauthorized", { status: 401 });
        if (server.upgrade(request, { data: { kind: "host" } })) return;
      }
      if (url.pathname === "/client" && host) {
        if (
          server.upgrade(request, {
            data: {
              kind: "phone",
              ch: crypto.randomUUID(),
              voiceId: url.searchParams.get("voiceId"),
            },
          })
        )
          return;
      }
      if (url.pathname === "/v1/auth/login")
        return Response.json({ user, session: { token: "orb_s_phone" } });
      if (url.pathname === "/v1/auth/logout") return new Response(null, { status: 204 });
      if (url.pathname === "/v1/me")
        return Response.json({
          user,
          farms: linkedFarm ? [{ farmId, name: "Demo", role: "owner" }] : [],
        });
      if (url.pathname === "/v1/push/notify") {
        const body: unknown = await request.json();
        receivedNotifications.push(body);
        notifications.push(body);
        return new Response(null, { status: notifyStatus });
      }
      if (url.pathname === "/v1/shape")
        return Response.json([{ headers: { control: "up-to-date" } }], {
          headers: { "electric-handle": "h1", "electric-offset": "0_0", "electric-up-to-date": "" },
        });
      if (url.pathname === "/v1/changes") return Response.json({ applied: 0 });
      if (url.pathname === "/v1/chat/sessions") return Response.json({ sessions: [], next: null });
      if (url.pathname.startsWith("/v1/chat/sessions/") && request.method === "POST")
        return Response.json({ ok: true });
      return Response.json({ error: { message: "Not found" } }, { status: 404 });
    },
    websocket: {
      open(socket) {
        switch (socket.data.kind) {
          case "host":
            host = socket;
            hosts.push(socket);
            break;
          case "phone":
            phones.set(socket.data.ch, socket);
            host?.send(
              JSON.stringify({
                t: "open",
                ch: socket.data.ch,
                ...(socket.data.voiceId
                  ? { channel: "voice", voiceId: socket.data.voiceId }
                  : { channel: "protocol" }),
              }),
            );
            break;
          default:
            socket.data satisfies never;
        }
      },
      message(socket, raw) {
        switch (socket.data.kind) {
          case "phone":
            host?.send(JSON.stringify({ t: "data", ch: socket.data.ch, d: String(raw) }));
            break;
          case "host": {
            const frame: unknown = JSON.parse(String(raw));
            if (
              typeof frame !== "object" ||
              frame === null ||
              !("ch" in frame) ||
              typeof frame.ch !== "string"
            )
              throw new Error("Invalid host envelope");
            if ("t" in frame && frame.t === "data" && "d" in frame && typeof frame.d === "string")
              phones.get(frame.ch)?.send(frame.d);
            if (
              "t" in frame &&
              frame.t === "close" &&
              "code" in frame &&
              typeof frame.code === "number"
            ) {
              closed.push({ ch: frame.ch, code: frame.code });
              phones
                .get(frame.ch)
                ?.close(frame.code >= 4000 && frame.code <= 4999 ? frame.code : 4410);
            }
            break;
          }
          default:
            socket.data satisfies never;
        }
      },
      close(socket, code) {
        switch (socket.data.kind) {
          case "phone":
            phones.delete(socket.data.ch);
            host?.send(JSON.stringify({ t: "close", ch: socket.data.ch, code: 1000 }));
            break;
          case "host":
            hostClosed.push(code);
            if (host === socket) host = null;
            for (const phone of phones.values()) phone.close(4410);
            break;
          default:
            socket.data satisfies never;
        }
      },
    },
  });
  onTestFinished(async () => {
    for (const client of clients) client.close();
    for (const socket of rawSockets) socket.close();
    await app.stop();
    core.stop(true);
    removeDir(dir);
  });
  const app = await startOrion({
    port: 0,
    token: TOKEN,
    dataDir: dir,
    mockModel: true,
    seed: true,
    gatewayUrl: null,
    appSource: null,
    coreUrl: `http://127.0.0.1:${core.port}`,
  });
  const local = await connect(app);
  clients.add(local);
  farmId = local.server?.farmId ?? "";
  return {
    app,
    local,
    dir,
    hosts,
    closed,
    hostClosed,
    notifications,
    receivedNotifications,
    get attempts() {
      return attempts;
    },
    set notifyStatus(status: number) {
      notifyStatus = status;
    },
    async signIn() {
      await local.request("account.login", { email: user.email, password: "password" });
      await local.request("settings.update", { provider: MOCK_PROVIDER, model: MOCK_MODEL });
    },
    async remote() {
      const client = createOrionClient(`ws://127.0.0.1:${core.port}/client`, "any-token", {
        reconnect: false,
      });
      clients.add(client);
      await client.ready();
      return client;
    },
    rawPhone(voiceId?: string) {
      const socket = new WebSocket(
        `ws://127.0.0.1:${core.port}/client${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ""}`,
      );
      rawSockets.add(socket);
      return socket;
    },
  };
}
