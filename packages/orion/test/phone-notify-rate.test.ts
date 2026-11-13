import { expect, spyOn, test } from "bun:test";
import type { AccountStatus } from "@orbit/protocol";
import { PhoneNotifications } from "../src/services/phone-notifications";
import { Mailbox } from "./phone-helpers";

test("access notifications share a 30 second conversation limit with settlement notifications", async () => {
  const received = new Mailbox<unknown>();
  const core = Bun.serve({
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/v1/push/notify");
      expect(request.headers.get("authorization")).toBe("Bearer session");
      expect(request.headers.get("x-orbit-farm")).toBe("farm");
      received.push(await request.json());
      return new Response(null, { status: 204 });
    },
  });
  const status: AccountStatus = {
    state: "signed_in",
    coreUrl: `http://127.0.0.1:${core.port}`,
    user: { id: "user", email: "user@example.test", name: null },
    farm: { id: "farm", name: "Farm", role: "owner" },
    farms: [],
    localFarm: null,
  };
  const clock = spyOn(Date, "now").mockReturnValue(100_000);
  let connected = false;
  const notifications = new PhoneNotifications(
    {
      status: () => status,
      cloudConnection: () => ({
        url: `http://127.0.0.1:${core.port}`,
        headers: { authorization: "Bearer session", "x-orbit-farm": "farm" },
      }),
    },
    () => connected,
    () => "Conversation title",
  );
  try {
    notifications.started("first");
    notifications.event("access.request", "first");
    expect(await received.next()).toEqual({
      kind: "orion_needs_you",
      sessionId: "first",
      title: "Conversation title",
    });
    clock.mockReturnValue(129_999);
    notifications.event("agent.settled", "first");
    notifications.started("first");
    notifications.event("access.request", "first");
    notifications.started("other");
    notifications.event("agent.settled", "other");
    expect(await received.next()).toMatchObject({ kind: "orion_done", sessionId: "other" });
    clock.mockReturnValue(130_000);
    notifications.event("agent.settled", "first");
    expect(await received.next()).toMatchObject({ kind: "orion_done", sessionId: "first" });

    connected = true;
    notifications.started("connected");
    notifications.event("access.request", "connected");
    connected = false;
    notifications.event("agent.settled", "connected");
    expect(await received.next()).toMatchObject({ kind: "orion_done", sessionId: "connected" });
  } finally {
    await notifications.stop();
    core.stop(true);
    clock.mockRestore();
  }
});
