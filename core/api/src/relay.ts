import type { Server, ServerWebSocket } from "bun";
import { farmHeader, memberRole, resolveSession } from "./auth";
import type { CoreDb } from "./db";

type Host = {
  readonly key: string;
  readonly clients: Map<string, ServerWebSocket<RelayConnection>>;
  readonly pending: Set<string>;
  socket?: ServerWebSocket<RelayConnection>;
};
export type RelayConnection = {
  readonly relay: true;
  readonly host: Host;
  readonly channel?: {
    readonly id: string;
    readonly channel: "protocol" | "voice";
    readonly voiceId?: string;
  };
  timer?: ReturnType<typeof setTimeout>;
};
const LIMIT = 8 * 1024 * 1024;
const error = (status: number, code: string) => Response.json({ error: { code } }, { status });

export function isRelaySocket<T extends RelayConnection | { readonly upstream: WebSocket }>(
  ws: ServerWebSocket<T>,
): ws is ServerWebSocket<T & RelayConnection> {
  return "relay" in ws.data;
}

export function createPhoneRelay(db: CoreDb, now = () => new Date()) {
  const hosts = new Map<string, Host>();
  function closeChannel(host: Host, id: string, code: number, reason: string) {
    const client = host.clients.get(id);
    if (!client) return;
    host.clients.delete(id);
    client.close(code, reason);
    host.socket?.send(JSON.stringify({ t: "close", ch: id, code, reason }));
  }
  return {
    async handle(request: Request, server: Pick<Server<RelayConnection>, "upgrade">) {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
      const user = await resolveSession(db, token, now());
      if (!user) return error(401, "unauthorized");
      const farmId = farmHeader(request.headers);
      if (
        !farmId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(farmId)
      )
        return error(400, "bad_request");
      if (!(await memberRole(db, farmId, user.id))) return error(403, "forbidden");
      const key = `${user.id}:${farmId.toLowerCase()}`;
      const url = new URL(request.url);
      if (url.pathname === "/v1/relay/status") return Response.json({ online: hosts.has(key) });
      if (!["/v1/relay/host", "/v1/relay/client"].includes(url.pathname))
        return error(404, "not_found");
      const channel = url.searchParams.get("channel") ?? "protocol";
      const voiceId = url.searchParams.get("voiceId") ?? "";
      const client = url.pathname === "/v1/relay/client";
      if (
        client &&
        ((channel !== "protocol" && channel !== "voice") || (channel === "voice" && !voiceId))
      )
        return error(400, "bad_request");
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return error(426, "upgrade_required");
      const host = client
        ? hosts.get(key)
        : {
            key,
            clients: new Map<string, ServerWebSocket<RelayConnection>>(),
            pending: new Set<string>(),
          };
      if (!host) return error(409, "pc_offline");
      if (client && host.clients.size + host.pending.size >= 8) return error(429, "too_many");
      const data: RelayConnection = { relay: true, host };
      if (client && (channel === "protocol" || channel === "voice")) {
        const id = crypto.randomUUID();
        const clientData: RelayConnection = {
          ...data,
          channel: {
            id,
            channel,
            ...(channel === "voice" ? { voiceId } : {}),
          },
        };
        host.pending.add(id);
        if (server.upgrade(request, { data: clientData })) {
          return;
        }
        host.pending.delete(id);
      } else if (server.upgrade(request, { data })) return;
      return error(400, "bad_request");
    },
    websocket: {
      open(ws: ServerWebSocket<RelayConnection>) {
        const { host, channel } = ws.data;
        if (channel) {
          host.pending.delete(channel.id);
          if (hosts.get(host.key) !== host || host.clients.size >= 8) {
            ws.close(4410, "pc_offline");
            return;
          }
          host.clients.set(channel.id, ws);
          host.socket?.send(
            JSON.stringify({
              t: "open",
              ch: channel.id,
              channel: channel.channel,
              ...(channel.voiceId ? { voiceId: channel.voiceId } : {}),
            }),
          );
        } else {
          const old = hosts.get(host.key);
          if (old) {
            old.socket?.close(4409, "replaced");
            for (const id of old.clients.keys()) closeChannel(old, id, 4410, "pc_offline");
          }
          host.socket = ws;
          hosts.set(host.key, host);
        }
        ws.data.timer = setTimeout(() => ws.close(4410, "pc_offline"), 60 * 60 * 1000);
      },
      message(ws: ServerWebSocket<RelayConnection>, message: string | Buffer) {
        const { host, channel } = ws.data;
        if (typeof message !== "string") {
          if (channel) closeChannel(host, channel.id, 4415, "text_required");
          else ws.close(4415, "text_required");
          return;
        }
        if (channel) {
          if (Buffer.byteLength(message) > LIMIT) closeChannel(host, channel.id, 4413, "too_large");
          else host.socket?.send(JSON.stringify({ t: "data", ch: channel.id, d: message }));
          return;
        }
        let frame: unknown;
        try {
          frame = JSON.parse(message);
        } catch (err) {
          if (err instanceof SyntaxError) {
            ws.close(4400, "bad_request");
            return;
          }
          throw err;
        }
        if (!frame || typeof frame !== "object" || !("ch" in frame) || typeof frame.ch !== "string")
          return;
        const client = host.clients.get(frame.ch);
        if (!client) return;
        if (Buffer.byteLength(message) > LIMIT) {
          closeChannel(host, frame.ch, 4413, "too_large");
          return;
        }
        if (!("t" in frame)) return;
        switch (frame.t) {
          case "data":
            if ("d" in frame && typeof frame.d === "string") client.send(frame.d);
            return;
          case "close": {
            const code =
              "code" in frame &&
              typeof frame.code === "number" &&
              Number.isInteger(frame.code) &&
              frame.code >= 4000 &&
              frame.code <= 4999
                ? frame.code
                : 4410;
            const reason =
              "reason" in frame && typeof frame.reason === "string" ? frame.reason : "";
            closeChannel(host, frame.ch, code, reason);
            return;
          }
        }
      },
      close(ws: ServerWebSocket<RelayConnection>, code: number, reason: string) {
        clearTimeout(ws.data.timer);
        const { host, channel } = ws.data;
        if (channel) {
          host.pending.delete(channel.id);
          if (host.clients.delete(channel.id))
            host.socket?.send(JSON.stringify({ t: "close", ch: channel.id, code, reason }));
        } else {
          if (hosts.get(host.key) === host) hosts.delete(host.key);
          host.socket = undefined;
          for (const id of host.clients.keys()) closeChannel(host, id, 4410, "pc_offline");
        }
      },
    },
  };
}
