import type { AccountService } from "./account";

type Connection = ReturnType<AccountService["cloudConnection"]>;
type RemoteRun = { readonly connection: Connection };

/** Only runs begun on the phone may notify; account credentials are captured with that run. */
export class PhoneNotifications {
  private readonly runs = new Map<string, RemoteRun>();
  private readonly sent = new Map<string, number>();
  private readonly pending = new Set<Promise<void>>();
  private readonly abort = new AbortController();

  constructor(
    private readonly account: Pick<AccountService, "status" | "cloudConnection">,
    private readonly connected: () => boolean,
    private readonly title: (sessionId: string) => string,
  ) {}

  started(sessionId: string): void {
    const status = this.account.status();
    if (status.state !== "signed_in" || !status.farm) return;
    this.runs.set(sessionId, { connection: this.account.cloudConnection() });
  }

  cancelled(sessionId: string): void {
    this.runs.delete(sessionId);
  }

  event(eventType: "agent.settled" | "access.request", sessionId: string): void {
    const run = this.runs.get(sessionId);
    let kind: "liv_done" | "liv_needs_you";
    switch (eventType) {
      case "agent.settled":
        this.runs.delete(sessionId);
        kind = "liv_done";
        break;
      case "access.request":
        kind = "liv_needs_you";
        break;
      default:
        throw new TypeError("Unknown phone notification event", {
          cause: eventType satisfies never,
        });
    }
    if (!run || this.connected() || this.abort.signal.aborted) return;
    const key = `${run.connection.headers.authorization}:${run.connection.headers["x-liv-farm"]}:${sessionId}`;
    const now = Date.now();
    if (now - (this.sent.get(key) ?? -Infinity) < 30_000) return;
    this.sent.set(key, now);
    const task = this.deliver(run, {
      kind,
      sessionId,
      title: this.title(sessionId),
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async stop(): Promise<void> {
    this.abort.abort();
    this.runs.clear();
    await Promise.all(this.pending);
  }

  private async deliver(
    run: RemoteRun,
    body: {
      readonly kind: "liv_done" | "liv_needs_you";
      readonly sessionId: string;
      readonly title: string;
    },
  ): Promise<void> {
    try {
      const response = await fetch(`${run.connection.url}/v1/push/notify`, {
        method: "POST",
        headers: { ...run.connection.headers, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10_000)]),
      });
      await response.body?.cancel();
      if (!response.ok) process.stderr.write(`liv: phone notify failed: HTTP ${response.status}\n`);
    } catch (error) {
      if (!this.abort.signal.aborted)
        process.stderr.write(
          `liv: phone notify failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
    }
  }
}
