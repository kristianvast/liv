import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { pushDevices } from "../src/db";
import { createPush } from "../src/push";
import { FARM, NOW } from "./billing-fixture";
import { pushFixture } from "./push-fixture";
import { deferred } from "./voice-agent-fixture";

const f = pushFixture();

test("device tokens move on upsert and only their owner can delete them", async () => {
  const app = f.app();
  const other = await f.otherMember();
  expect(
    await (
      await f.request(app, "devices", { token: "phone", platform: "android", locale: "nb" })
    ).json(),
  ).toEqual({ ok: true });
  expect(
    (await f.request(app, "devices", { token: "phone", platform: "android" }, other.headers))
      .status,
  ).toBe(200);
  expect(await f.db.select().from(pushDevices)).toMatchObject([
    { token: "phone", userId: other.userId, locale: null },
  ]);
  await f.request(app, "devices", { token: "phone" }, f.headers(), "DELETE");
  expect((await f.db.select().from(pushDevices)).length).toBe(1);
  expect(
    await (await f.request(app, "devices", { token: "phone" }, other.headers, "DELETE")).json(),
  ).toEqual({ ok: true });
  expect(await f.db.select().from(pushDevices)).toEqual([]);
  expect(
    (await f.request(app, "devices", { token: "unknown" }, other.headers, "DELETE")).status,
  ).toBe(200);
});

test.each(["liv_done", "liv_needs_you"] as const)(
  "notify %s delivers only to caller devices with exact FCM shape",
  async (kind) => {
    const transport = f.transport();
    const app = f.app({ push: transport.push });
    const other = await f.otherMember();
    await f.request(app, "devices", { token: "mine", platform: "android" });
    await f.request(app, "devices", { token: "theirs", platform: "android" }, other.headers);
    expect(
      (await f.request(app, "notify", { kind, sessionId: "conversation", title: "Morning check" }))
        .status,
    ).toBe(204);
    await transport.done;
    expect(transport.requests).toEqual([
      {
        url: "https://fcm.googleapis.com/v1/projects/test-project/messages:send",
        auth: "Bearer fake-google-token",
      },
    ]);
    expect(transport.messages).toEqual([
      {
        message: {
          token: "mine",
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "liv",
              title_loc_key: kind === "liv_done" ? "push_liv_done_title" : "push_liv_needs_title",
              body: "Morning check",
            },
          },
          data: { kind, farmId: FARM, sessionId: "conversation" },
        },
      },
    ]);
  },
);

test.each([
  { headers: {}, status: 401 },
  { headers: { authorization: "Bearer legacy" }, status: 403 },
  { headers: { "x-liv-farm": "00000000-0000-4000-8000-000000000099" }, status: 403 },
  { headers: { "x-liv-farm": "" }, status: 400 },
])("notify refuses unauthorized principal $status", async ({ headers, status }) => {
  const app = f.app({ resolveToken: async () => FARM });
  const merged = Object.keys(headers).length
    ? { ...f.headers(), ...headers }
    : { "content-type": "application/json" };
  expect(
    (await f.request(app, "notify", { kind: "liv_done", sessionId: "s", title: "title" }, merged))
      .status,
  ).toBe(status);
});

test.each([404, 400])("FCM %i UNREGISTERED removes the device", async (status) => {
  const transport = f.transport(
    1,
    Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status }),
  );
  const app = f.app();
  await f.request(app, "devices", { token: "stale", platform: "android" });
  await createPush(f.db, transport.push).notify(f.session.userId, {
    kind: "liv_done",
    farmId: FARM,
    sessionId: "s",
    title: "Done",
  });
  expect(await f.db.select().from(pushDevices)).toEqual([]);
  await transport.done;
});

test("device routes work and sends skip without a project id", async () => {
  const app = f.app();
  await f.request(app, "devices", { token: "local", platform: "android" });
  let calls = 0;
  await createPush(f.db, {
    projectId: "",
    accessToken: async () => {
      calls++;
      return "unused";
    },
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  }).notify(f.session.userId, { kind: "liv_done", farmId: FARM, sessionId: "s", title: "Done" });
  await createPush(f.db).observations([crypto.randomUUID()], NOW);
  expect(calls).toBe(0);
  expect(await f.db.select().from(pushDevices).where(eq(pushDevices.token, "local"))).toHaveLength(
    1,
  );
});

test("device input requires an Android token and notify validates its payload", async () => {
  const app = f.app();
  for (const body of [
    {},
    { token: "t", platform: "ios" },
    { token: "t", platform: "android", locale: 42 },
  ])
    expect((await f.request(app, "devices", body)).status).toBe(400);
  expect(
    (await f.request(app, "notify", { kind: "health_event", title: "invalid", sessionId: "s" }))
      .status,
  ).toBe(400);
});

test("notify enforces title and sessionId length boundaries", async () => {
  const app = f.app();
  for (const body of [
    { title: "a".repeat(301), sessionId: "s" },
    { title: "title", sessionId: "s".repeat(201) },
  ]) {
    const response = await f.request(app, "notify", { kind: "liv_done", ...body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "bad_request" } });
  }
  expect(
    (
      await f.request(app, "notify", {
        kind: "liv_done",
        title: "a".repeat(300),
        sessionId: "s".repeat(200),
      })
    ).status,
  ).toBe(204);
});

test("notify responds before FCM completes and survives delivery rejection", async () => {
  const entered = deferred<void>();
  const provider = deferred<Response>();
  const app = f.app({
    push: {
      projectId: "fake",
      accessToken: async () => "fake",
      fetch: async () => {
        entered.resolve();
        return provider.promise;
      },
    },
  });
  await f.request(app, "devices", { token: "phone", platform: "android" });
  const response = await f.request(app, "notify", {
    kind: "liv_done",
    sessionId: "s",
    title: "done",
  });
  expect(response.status).toBe(204);
  await entered.promise;
  provider.reject(new TypeError("Simulated FCM network failure"));
});
