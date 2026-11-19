import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const Envelope = Type.Union([
  Type.Object({
    t: Type.Literal("open"),
    ch: Type.String(),
    channel: Type.Literal("protocol"),
  }),
  Type.Object({
    t: Type.Literal("open"),
    ch: Type.String(),
    channel: Type.Literal("voice"),
    voiceId: Type.String(),
  }),
  Type.Object({ t: Type.Literal("data"), ch: Type.String(), d: Type.String() }),
  Type.Object({
    t: Type.Literal("close"),
    ch: Type.String(),
    code: Type.Optional(Type.Integer()),
    reason: Type.Optional(Type.String()),
  }),
]);
type Envelope = Static<typeof Envelope>;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/** One host connection owns all of its loopback sockets. No local endpoint leaves this class. */
export class PhoneChannels {
  private readonly channels = new Map<string, { socket: WebSocket; pending: string[] }>();

  constructor(
    private readonly host: WebSocket,
    private readonly endpoint: {
      readonly port: number;
      readonly token: string;
      readonly secret: string;
    },
  ) {}

  receive(raw: unknown): void {
    if (typeof raw !== "string") {
      this.host.close(4415, "Text frames required");
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.host.close(4400, "Invalid relay envelope");
      return;
    }
    if (!Value.Check(Envelope, value)) {
      this.host.close(4400, "Invalid relay envelope");
      return;
    }
    switch (value.t) {
      case "open": {
        if (this.channels.has(value.ch)) return;
        let path: string;
        switch (value.channel) {
          case "protocol":
            path = `/ws?relay=${encodeURIComponent(this.endpoint.secret)}`;
            break;
          case "voice":
            path = `/voice/${encodeURIComponent(this.endpoint.token)}/${encodeURIComponent(value.voiceId)}`;
            break;
          default:
            throw new TypeError("Unknown relay channel", { cause: value satisfies never });
        }
        const socket = new WebSocket(`ws://127.0.0.1:${this.endpoint.port}${path}`);
        const pending: string[] = [];
        const channel = { socket, pending };
        this.channels.set(value.ch, channel);
        socket.onopen = () => {
          for (const frame of channel.pending.splice(0)) socket.send(frame);
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string")
            this.closeChannel(value.ch, 4415, "Text frames required");
          else if (Buffer.byteLength(event.data) > MAX_FRAME_BYTES)
            this.closeChannel(value.ch, 4413, "Frame exceeds 8 MiB");
          else this.send({ t: "data", ch: value.ch, d: event.data });
        };
        socket.onclose = (event) => {
          if (!this.channels.delete(value.ch)) return;
          this.send({ t: "close", ch: value.ch, code: event.code, reason: event.reason });
        };
        socket.onerror = () => {
          this.closeChannel(value.ch, 4410, "Loopback unavailable");
        };
        return;
      }
      case "data": {
        const channel = this.channels.get(value.ch);
        if (!channel) return;
        if (Buffer.byteLength(value.d) > MAX_FRAME_BYTES) {
          this.closeChannel(value.ch, 4413, "Frame exceeds 8 MiB");
          return;
        }
        if (channel.socket.readyState === WebSocket.OPEN) channel.socket.send(value.d);
        else channel.pending.push(value.d);
        return;
      }
      case "close": {
        const channel = this.channels.get(value.ch);
        if (!channel) return;
        const code = value.code ?? 1000;
        channel.socket.close(
          code === 1000 || (code >= 3000 && code <= 4999) ? code : 4410,
          value.reason,
        );
        return;
      }
      default:
        throw new TypeError("Unknown relay envelope", { cause: value satisfies never });
    }
  }

  dispose(): void {
    for (const { socket } of this.channels.values()) socket.close(4410, "Relay disconnected");
    this.channels.clear();
  }

  private closeChannel(ch: string, code: number, reason: string): void {
    const channel = this.channels.get(ch);
    if (!channel) return;
    this.channels.delete(ch);
    channel.socket.close(code, reason);
    this.send({ t: "close", ch, code, reason });
  }

  private send(envelope: Envelope): void {
    if (this.host.readyState === WebSocket.OPEN) this.host.send(JSON.stringify(envelope));
  }
}
