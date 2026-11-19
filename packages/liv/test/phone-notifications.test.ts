import { expect, spyOn, test } from "bun:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { waitFor } from "./helpers";
import { Mailbox, phoneFixture } from "./phone-helpers";

test("notifies once when a remotely started chat settles after the phone disconnects", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const { session } = await remote.request("sessions.create", { title: "Check commands" });
  const asking = waitFor(fixture.local, "access.request");
  await remote.request("chat.prompt", { sessionId: session.id, text: "check git" });
  const ask = await asking;
  expect(fixture.receivedNotifications).toEqual([]);
  remote.close();
  await fixture.closed.next();
  await fixture.local.request("sessions.rename", {
    sessionId: session.id,
    title: "Updated commands",
  });
  const settled = waitFor(fixture.local, "agent.settled");
  await fixture.local.request("access.respond", { requestId: ask.requestId, allow: false });
  await settled;
  expect(await fixture.notifications.next()).toEqual({
    kind: "liv_done",
    sessionId: session.id,
    title: "Updated commands",
  });
  expect(fixture.receivedNotifications).toHaveLength(1);
});

test("notifies for access while the remotely started model is running without a connected phone", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const { session } = await remote.request("sessions.create", { title: "Needs access" });
  const entered = new Mailbox<boolean>();
  const release = Promise.withResolvers<void>();
  const runtime = fixture.app.hub.runtime;
  const original = runtime.streamSimple.bind(runtime);
  const spy = spyOn(runtime, "streamSimple").mockImplementation((model, context, options) => {
    const output = createAssistantMessageEventStream();
    entered.push(true);
    void release.promise.then(async () => {
      for await (const event of original(model, context, options)) output.push(event);
      output.end();
    });
    return output;
  });
  try {
    await remote.request("chat.prompt", { sessionId: session.id, text: "check git" });
    await entered.next();
    remote.close();
    await fixture.closed.next();
    const asking = waitFor(fixture.local, "access.request");
    release.resolve();
    const ask = await asking;
    expect(await fixture.notifications.next()).toEqual({
      kind: "liv_needs_you",
      sessionId: session.id,
      title: "Needs access",
    });
    const settled = waitFor(fixture.local, "agent.settled");
    await fixture.local.request("access.respond", { requestId: ask.requestId, allow: false });
    await settled;
    expect(fixture.receivedNotifications).toHaveLength(1);
  } finally {
    release.resolve();
    spy.mockRestore();
  }
});

test("a failed notify cannot fail chat settlement", async () => {
  const fixture = await phoneFixture();
  fixture.notifyStatus = 503;
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const { session } = await remote.request("sessions.create", { title: "Offline push" });
  const asking = waitFor(fixture.local, "access.request");
  await remote.request("chat.prompt", { sessionId: session.id, text: "check git" });
  const ask = await asking;
  remote.close();
  await fixture.closed.next();
  const settled = waitFor(fixture.local, "agent.settled");
  await fixture.local.request("access.respond", { requestId: ask.requestId, allow: false });
  expect((await settled).reason).toBe("completed");
  await fixture.notifications.next();
  expect(
    (await fixture.local.request("sessions.open", { sessionId: session.id })).session.streaming,
  ).toBe(false);
});
