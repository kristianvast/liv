import type { RequestType } from "@orbit/protocol";
import type { AccountService } from "./account";
import { PhoneChannels } from "./phone-channels";

/** Deliberate opt-in at the protocol boundary; new request families remain local by default. */
export function remoteRequestAllowed(type: RequestType): boolean {
  return (
    type === "hello" ||
    type.startsWith("sessions.") ||
    type.startsWith("chat.") ||
    type.startsWith("voice.") ||
    [
      "pages.list",
      "pages.read",
      "modules.list",
      "settings.get",
      "db.query",
      "db.mutate",
      "snapshots.list",
      "snapshots.undo",
      "account.status",
    ].includes(type)
  );
}

export class PhoneRelay {
  private socket: WebSocket | null = null;
  private channels: PhoneChannels | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private connectionKey: string | null = null;
  private delay = 1000;
  private stopped = false;

  constructor(
    private readonly account: Pick<AccountService, "status" | "cloudConnection">,
    private readonly endpoint: {
      readonly port: number;
      readonly token: string;
      readonly secret: string;
    },
    private readonly enabled: () => boolean,
  ) {}

  refresh(): void {
    if (this.stopped) return;
    const status = this.account.status();
    const connection =
      this.enabled() && status.coreUrl && status.state === "signed_in" && status.farm
        ? this.account.cloudConnection()
        : null;
    const key = connection ? JSON.stringify(connection) : null;
    if (key === this.connectionKey && (this.socket || this.timer || !connection)) return;
    this.disconnect();
    if (this.connectionKey !== key) this.delay = 1000;
    this.connectionKey = key;
    if (connection) this.connect(connection);
  }

  stop(): void {
    this.stopped = true;
    this.disconnect();
    this.connectionKey = null;
  }

  private connect(connection: ReturnType<AccountService["cloudConnection"]>): void {
    const url = new URL(`${connection.url}/v1/relay/host`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, { headers: connection.headers });
    this.socket = socket;
    const channels = new PhoneChannels(socket, this.endpoint);
    this.channels = channels;
    socket.onopen = () => {
      this.delay = 1000;
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) channels.receive(event.data);
    };
    socket.onerror = () => {
      // Bun follows connection errors with close; that single path schedules reconnect.
    };
    socket.onclose = () => {
      channels.dispose();
      if (this.socket !== socket) return;
      this.socket = null;
      this.channels = null;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.refresh();
      }, this.delay);
      this.delay = Math.min(this.delay * 2, 30_000);
    };
  }

  private disconnect(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const socket = this.socket;
    this.socket = null;
    this.channels?.dispose();
    this.channels = null;
    socket?.close(1000, "Phone access changed");
  }
}
