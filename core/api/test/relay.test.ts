import { afterEach, expect, test } from "bun:test";
import type { Server } from "bun";
import { createSession } from "../src/auth";
import { farmMembers, users } from "../src/db";
import { createPhoneRelay, type RelayConnection } from "../src/relay";
import { billingFixture, FARM, NOW } from "./billing-fixture";
import { deferred, socketEvent } from "./voice-agent-fixture";

const { db, headers } = billingFixture();
const servers: Server<RelayConnection>[] = [];
const sockets: WebSocket[] = [];
function serve() {
  const relay = createPhoneRelay(db, () => NOW);
  const server = Bun.serve<RelayConnection>({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, server) => relay.handle(request, server),
    websocket: { ...relay.websocket, maxPayloadLength: 16 * 1024 * 1024 },
  });
  servers.push(server);
  return server;
}
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const server of servers.splice(0)) await server.stop(true);
});
function connect(server: ReturnType<typeof serve>, path: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/v1/relay/${path}`, {
    headers: headers(),
  });
  sockets.push(socket);
  return socket;
}
function message(socket: WebSocket) {
  const result = deferred<string>();
  socket.addEventListener("message", (event) => result.resolve(String(event.data)), { once: true });
  return result.promise;
}
async function pair(path = "client") {
  const server = serve();
  const host = connect(server, "host");
  await socketEvent(host, "open");
  const opening = message(host);
  const client = connect(server, path);
  await socketEvent(client, "open");
  const frame: { ch: string; channel: string; voiceId?: string; t: string } = JSON.parse(
    await opening,
  );
  return { server, host, client, frame };
}

test.each(["client", "client?channel=voice&voiceId=voice-1"])(
  "%s pipes verbatim frames both ways and propagates client close",
  async (path) => {
    const { host, client, frame } = await pair(path);
    expect(frame).toMatchObject({ t: "open", channel: path === "client" ? "protocol" : "voice" });
    if (path !== "client") expect(frame.voiceId).toBe("voice-1");
    const forwarded = message(host);
    client.send(' {"hello": "phone"} ');
    expect(JSON.parse(await forwarded)).toEqual({
      t: "data",
      ch: frame.ch,
      d: ' {"hello": "phone"} ',
    });
    const received = message(client);
    host.send(JSON.stringify({ t: "data", ch: frame.ch, d: ' {"hello": "farm"} ' }));
    expect(await received).toBe(' {"hello": "farm"} ');
    const closed = message(host);
    client.close(4001, "finished");
    expect(JSON.parse(await closed)).toEqual({
      t: "close",
      ch: frame.ch,
      code: 4001,
      reason: "finished",
    });
  },
);

test.each([4003, 1000])(
  "host channel close %i preserves application codes or maps to offline",
  async (code) => {
    const { host, client, frame } = await pair();
    const closed = socketEvent(client, "close");
    host.send(JSON.stringify({ t: "close", ch: frame.ch, code, reason: "ended" }));
    expect(await closed).toMatchObject({ code: code === 4003 ? 4003 : 4410, reason: "ended" });
  },
);

test("replacing a host closes the old host with 4409 and its clients with 4410", async () => {
  const { server, host, client } = await pair();
  const oldClosed = socketEvent(host, "close");
  const clientClosed = socketEvent(client, "close");
  const replacement = connect(server, "host");
  await socketEvent(replacement, "open");
  expect((await oldClosed).code).toBe(4409);
  expect((await clientClosed).code).toBe(4410);
  const response = await fetch(`http://127.0.0.1:${server.port}/v1/relay/status`, {
    headers: headers(),
  });
  expect(await response.json()).toEqual({ online: true });
});

test("host disconnect closes clients and status becomes offline", async () => {
  const { server, host, client } = await pair();
  const closed = socketEvent(client, "close");
  host.close();
  expect((await closed).code).toBe(4410);
  expect(
    await (
      await fetch(`http://127.0.0.1:${server.port}/v1/relay/status`, { headers: headers() })
    ).json(),
  ).toEqual({ online: false });
});

test("another member of the same farm cannot reach this account's host", async () => {
  const { server } = await pair();
  const [user] = await db.insert(users).values({ email: "phone-other@example.test" }).returning();
  if (!user) throw new TypeError("Missing other member");
  await db.insert(farmMembers).values({ userId: user.id, farmId: FARM, role: "worker" });
  const session = await createSession(db, user.id, null, NOW);
  const response = await fetch(`http://127.0.0.1:${server.port}/v1/relay/client`, {
    headers: { ...headers(), authorization: `Bearer ${session.token}`, upgrade: "websocket" },
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: { code: "pc_offline" } });
});

test.each([
  { name: "missing session", headers: {}, path: "host", status: 401, code: "unauthorized" },
  {
    name: "nonmember",
    headers: { "x-orbit-farm": "00000000-0000-4000-8000-000000000099" },
    path: "client",
    status: 403,
    code: "forbidden",
  },
  {
    name: "bad farm",
    headers: { "x-orbit-farm": "bad" },
    path: "host",
    status: 400,
    code: "bad_request",
  },
  { name: "offline", headers: {}, path: "client", status: 409, code: "pc_offline" },
  {
    name: "invalid channel",
    headers: {},
    path: "client?channel=other",
    status: 400,
    code: "bad_request",
  },
  {
    name: "missing voice id",
    headers: {},
    path: "client?channel=voice",
    status: 400,
    code: "bad_request",
  },
])("refuses $name before upgrade", async ({ name, headers: extra, path, status, code }) => {
  const server = serve();
  const response = await fetch(`http://127.0.0.1:${server.port}/v1/relay/${path}`, {
    headers: {
      ...(name === "missing session" ? {} : headers()),
      ...extra,
      upgrade: "websocket",
      connection: "Upgrade",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
});

test("requires upgrade and farm header while status remains ordinary HTTP", async () => {
  const server = serve();
  const url = `http://127.0.0.1:${server.port}/v1/relay`;
  expect((await fetch(`${url}/host`, { headers: headers() })).status).toBe(426);
  expect(
    (await fetch(`${url}/status`, { headers: { authorization: headers().authorization } })).status,
  ).toBe(400);
  expect(await (await fetch(`${url}/status`, { headers: headers() })).json()).toEqual({
    online: false,
  });
});

test("ninth client is refused with 429 too_many", async () => {
  const server = serve();
  const host = connect(server, "host");
  await socketEvent(host, "open");
  for (let i = 0; i < 8; i++) {
    const opening = message(host);
    const client = connect(server, "client");
    await socketEvent(client, "open");
    await opening;
  }
  const response = await fetch(`http://127.0.0.1:${server.port}/v1/relay/client`, {
    headers: { ...headers(), upgrade: "websocket" },
  });
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: { code: "too_many" } });
});

test("text at the 8 MiB envelope limit relays both ways", async () => {
  const { host, client, frame } = await pair();
  const overhead = Buffer.byteLength(JSON.stringify({ t: "data", ch: frame.ch, d: "" }));
  const text = "a".repeat(8 * 1024 * 1024 - overhead);
  const forwarded = message(host);
  client.send(text);
  const envelope = await forwarded;
  expect(JSON.parse(envelope)).toEqual({ t: "data", ch: frame.ch, d: text });
  const received = message(client);
  host.send(envelope);
  expect(await received).toBe(text);
});

test.each(["binary", "oversize", "host-oversize"])(
  "%s closes only its channel with the required code",
  async (kind) => {
    const { host, client, frame } = await pair();
    const closed = socketEvent(client, "close");
    switch (kind) {
      case "binary":
        client.send(new Uint8Array([1]));
        break;
      case "oversize":
        client.send("a".repeat(8 * 1024 * 1024 + 1));
        break;
      case "host-oversize":
        host.send(JSON.stringify({ t: "data", ch: frame.ch, d: "a".repeat(8 * 1024 * 1024 + 1) }));
        break;
    }
    expect((await closed).code).toBe(kind === "binary" ? 4415 : 4413);
    expect(host.readyState).toBe(WebSocket.OPEN);
  },
);
