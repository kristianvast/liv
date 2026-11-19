import { expect, test } from "bun:test";
import { LivRequestError } from "@liv/protocol/client";
import { waitFor } from "./helpers";
import { Mailbox, phoneFixture } from "./phone-helpers";

test("dials only while signed in with phone access, and chat round-trips remotely", async () => {
  const fixture = await phoneFixture();
  expect((await fixture.local.request("settings.get")).phoneAccess).toBe(false);
  await fixture.local.request("settings.update", { phoneAccess: true });
  expect(fixture.attempts).toBe(0);
  await fixture.local.request("settings.update", { phoneAccess: false });
  await fixture.signIn();
  expect(fixture.attempts).toBe(0);

  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  expect(remote.server?.protocolVersion).toBe(1);
  const { session } = await remote.request("sessions.create", { title: "Phone chat" });
  const settled = waitFor(remote, "agent.settled");
  await remote.request("chat.prompt", { sessionId: session.id, text: "Hello from the phone" });
  await settled;
  const history = await remote.request("sessions.open", { sessionId: session.id });
  expect(
    history.items.some(
      (item) => item.kind === "assistant" && item.text.includes("Hello from the phone"),
    ),
  ).toBe(true);
  expect(fixture.receivedNotifications).toEqual([]);

  await fixture.local.request("settings.update", { phoneAccess: false });
  await fixture.hostClosed.next();
});

test("remote writes to desktop controls are forbidden while local controls still work", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const errors = [
    await remote
      .request("settings.update", { phoneAccess: false })
      .catch((error: unknown) => error),
    await remote.request("auth.providers").catch((error: unknown) => error),
    await remote
      .request("access.respond", { requestId: "absent", allow: true })
      .catch((error: unknown) => error),
  ];
  for (const error of errors) {
    expect(error).toBeInstanceOf(LivRequestError);
    expect(error).toMatchObject({ code: "forbidden" });
  }
  expect((await fixture.local.request("settings.update", { phoneAccess: true })).phoneAccess).toBe(
    true,
  );
  expect((await fixture.local.request("auth.providers")).providers).toBeArray();
  expect(
    await fixture.local.request("access.respond", { requestId: "absent", allow: false }),
  ).toEqual({ accepted: false });
  expect((await remote.request("account.status")).state).toBe("signed_in");
});

test("remote hello still checks the version and propagates the loopback close", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const phone = fixture.rawPhone();
  const done = new Promise<number>((resolve) => {
    phone.onopen = () =>
      phone.send(
        JSON.stringify({ id: "hello", type: "hello", token: "ignored", protocolVersion: 99 }),
      );
    phone.onclose = (event) => resolve(event.code);
  });
  expect(await fixture.closed.next()).toMatchObject({ code: 4400 });
  expect(await done).toBe(4400);
});

test("reconnects after Core closes the host and stops when signed out", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  const host = await fixture.hosts.next();
  host.close(1000, "session expired");
  await fixture.hosts.next();
  expect(fixture.attempts).toBe(2);
  await fixture.hostClosed.next();
  await fixture.local.request("account.logout");
  await fixture.hostClosed.next();
  expect((await fixture.local.request("account.status")).state).toBe("signed_out");
});

test("a voice channel pipes its frames and closes when the remote protocol owner disconnects", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const { session } = await remote.request("sessions.create", { title: "Voice" });
  const { voiceId } = await remote.request("voice.start", { sessionId: session.id });
  const socket = fixture.rawPhone(voiceId);
  const frames = new Mailbox<unknown>();
  const closed = new Mailbox<number>();
  socket.onopen = () => socket.send('{"type":"conversation_initiation_client_data"}');
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)));
  socket.onclose = (event) => closed.push(event.code);
  expect(await frames.next()).toMatchObject({ type: "conversation_initiation_metadata" });
  expect(await frames.next()).toMatchObject({ type: "agent_response" });
  remote.close();
  expect(await closed.next()).toBe(4410);
});

test("a signed-in account without a linked farm never dials the relay", async () => {
  const fixture = await phoneFixture(false);
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  expect(await fixture.local.request("account.status")).toMatchObject({
    state: "signed_in",
    farm: null,
  });
  expect(fixture.attempts).toBe(0);
});

test("an inner frame over 8 MiB closes only its channel with 4413", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const phone = fixture.rawPhone();
  phone.onopen = () => phone.send("x".repeat(8 * 1024 * 1024 + 1));
  expect(await fixture.closed.next()).toMatchObject({ code: 4413 });
  const remote = await fixture.remote();
  expect((await remote.request("settings.get")).phoneAccess).toBe(true);
});

test.each(["chat.prompt", "chat.steer", "chat.followUp"] as const)(
  "%s keeps not_found for an unknown session",
  async (type) => {
    const fixture = await phoneFixture();
    const error = await fixture.local
      .request(type, { sessionId: "unknown-session", text: "Hello" })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: "not_found",
      message: "session unknown-session not found",
    });
  },
);

test("binary host frames are refused with 4415", async () => {
  const fixture = await phoneFixture();
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  const host = await fixture.hosts.next();
  host.send(Buffer.from("binary"));
  expect(await fixture.hostClosed.next()).toBe(4415);
});
