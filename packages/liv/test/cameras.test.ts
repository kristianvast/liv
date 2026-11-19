import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CameraMapLayout } from "@liv/protocol";
import { cameraLayouts, outbox } from "@liv/schema";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/db/open";
import { EncryptedFileStore } from "../src/secrets";
import { CameraService } from "../src/services/cameras";
import { Go2rtcRelay, resolveRelayBinary } from "../src/services/relay";
import { connect, removeDir, startApp, TOKEN, tempDir, waitFor } from "./helpers";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const layout = {
  version: 2,
  tiles: [{ i: "barn", x: -30, y: 20, w: 400, ar: 16 / 9 }],
} satisfies CameraMapLayout;

test("camera layout writes keep one row with outbox, snapshot and change notifications", () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const db = openDatabase(dir, { seed: true });
  cleanups.push(() => db.close());
  const changed: string[] = [];
  db.repo.onChange((table) => changed.push(table));
  expect(db.repo.query("cameraLayout.get", {})).toEqual({ layout: null });

  const saved = db.repo.saveCameraLayout(layout);
  db.repo.saveCameraLayout({ version: 2, tiles: [] });

  expect(db.repo.query("cameraLayout.get", {})).toEqual({ layout: { version: 2, tiles: [] } });
  expect(db.repo.db.select().from(cameraLayouts).all()).toHaveLength(1);
  const queued = db.repo.db.select().from(outbox).where(eq(outbox.table, "camera_layouts")).all();
  expect(queued.map((row) => row.op)).toEqual(["insert", "update"]);
  expect(queued[0]?.payload.layout).toEqual(layout);
  expect(queued[0]?.rowId).toBe(db.repo.farm()?.id);
  expect(queued[0]?.hlc).toBeString();
  expect(changed).toEqual(["camera_layouts", "camera_layouts"]);
  if (!saved.snapshotId) throw new TypeError("missing snapshot");
  expect(db.repo.getSnapshot(saved.snapshotId).changes[0]).toMatchObject({
    table: "camera_layouts",
    before: null,
    after: { layout },
  });
});

test("malformed camera layouts are rejected without queuing a write", () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const db = openDatabase(dir, { seed: true });
  cleanups.push(() => db.close());

  expect(() => db.repo.saveCameraLayout({ version: 2, tiles: [{ i: "barn", w: -1 }] })).toThrow(
    "invalid camera layout",
  );

  expect(db.repo.query("cameraLayout.get", {})).toEqual({ layout: null });
  expect(db.repo.db.select().from(outbox).all()).toEqual([]);
});

test("camera layout save and get round trip over the protocol and emit camera_layouts", async () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const app = await startApp(dir);
  cleanups.push(() => app.stop());
  const client = await connect(app);
  cleanups.push(() => client.close());
  const changed = waitFor(client, "db.changed", (event) => event.table === "camera_layouts");

  await client.mutate("cameraLayout.save", { layout });

  const farmId = client.server?.farmId;
  if (!farmId) throw new TypeError("missing farm");
  expect((await changed).ids).toEqual([farmId]);
  expect(await client.query("cameraLayout.get", {})).toEqual({ layout });
});

test("go2rtc binary resolution uses override, sibling, data directory, then PATH", () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const name = process.platform === "win32" ? "go2rtc.exe" : "go2rtc";
  const execPath = join(dir, "sidecars", "orion");
  const candidates = [
    join(dir, "override"),
    join(dirname(execPath), name),
    join(dir, "bin", name),
    join(dir, "path", name),
  ];
  const env = { LIV_GO2RTC_BIN: candidates[0], PATH: join(dir, "path") };
  expect(resolveRelayBinary(dir, env, execPath)).toBeNull();
  for (const candidate of [...candidates].reverse()) {
    mkdirSync(dirname(candidate), { recursive: true });
    writeFileSync(candidate, "");
    chmodSync(candidate, 0o755);
    expect(resolveRelayBinary(dir, env, execPath)).toBe(candidate);
  }
});

test("an absent relay reports unavailable while authenticated camera routes return 503", async () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const prior = process.env.LIV_GO2RTC_BIN;
  process.env.LIV_GO2RTC_BIN = join(dir, "missing");
  cleanups.push(() => {
    if (prior === undefined) delete process.env.LIV_GO2RTC_BIN;
    else process.env.LIV_GO2RTC_BIN = prior;
  });
  const db = openDatabase(dir, { seed: true });
  cleanups.push(() => db.close());
  const relay = new Go2rtcRelay(db.repo, new EncryptedFileStore(dir), dir);
  await relay.start();
  cleanups.push(() => relay.stop());
  expect(relay.status()).toEqual({ available: false, reason: "go2rtc binary not found" });
  const app = await startApp(dir);
  cleanups.push(() => app.stop());
  const client = await connect(app);
  cleanups.push(() => client.close());

  expect(await client.query("cameras.relay", {})).toEqual(relay.status());
  for (const endpoint of ["frame.jpeg", "ws"]) {
    expect((await fetch(`http://127.0.0.1:${app.port}/camera/wrong/barn/${endpoint}`)).status).toBe(
      401,
    );
    expect(
      (await fetch(`http://127.0.0.1:${app.port}/camera/${TOKEN}/barn/${endpoint}`)).status,
    ).toBe(503);
  }
});

/** A camera that answers the ONVIF calls Liv makes, the way a first-generation (Profile S) camera does. */
function onvifCamera(logins: string[]) {
  const envelope = (body: string) =>
    `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body>${body}</s:Body></s:Envelope>`;
  return Bun.serve({
    port: 0,
    async fetch(request): Promise<Response> {
      const asked = await request.text();
      const login = /<Username>([^<]*)<\/Username>/.exec(asked)?.[1];
      if (login) logins.push(login);
      const media = `${new URL(request.url).origin}/onvif/media`;
      const reply = asked.includes("<GetSystemDateAndTime")
        ? "<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime><tt:UTCDateTime><tt:Time><tt:Hour>12</tt:Hour><tt:Minute>0</tt:Minute><tt:Second>0</tt:Second></tt:Time><tt:Date><tt:Year>2026</tt:Year><tt:Month>11</tt:Month><tt:Day>14</tt:Day></tt:Date></tt:UTCDateTime></tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse>"
        : asked.includes("<GetCapabilities")
          ? `<tds:GetCapabilitiesResponse><tds:Capabilities><tt:Media><tt:XAddr>${media}</tt:XAddr></tt:Media></tds:Capabilities></tds:GetCapabilitiesResponse>`
          : asked.includes("<GetProfiles")
            ? '<trt:GetProfilesResponse><trt:Profiles token="main" fixed="true"><tt:Name>main</tt:Name></trt:Profiles></trt:GetProfilesResponse>'
            : asked.includes("<GetStreamUri") && asked.includes("<ProfileToken>main</ProfileToken>")
              ? "<trt:GetStreamUriResponse><trt:MediaUri><tt:Uri>rtsp://farmer:barn@127.0.0.1:554/stream1</tt:Uri></trt:MediaUri></trt:GetStreamUriResponse>"
              : null;
      return new Response(
        envelope(
          reply ??
            "<s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text>not supported</s:Text></s:Reason></s:Fault>",
        ),
        { status: reply ? 200 : 400, headers: { "content-type": "application/soap+xml" } },
      );
    },
  });
}

test("a camera saved with only its ONVIF address gets its stream address from the camera", async () => {
  const dir = tempDir();
  cleanups.push(() => removeDir(dir));
  const db = openDatabase(dir, { seed: true });
  cleanups.push(() => db.close());
  const logins: string[] = [];
  const camera = onvifCamera(logins);
  cleanups.push(() => camera.stop(true));
  const onvifXaddr = `http://127.0.0.1:${camera.port}/onvif/device_service`;
  const cameras = new CameraService(db.repo, new EncryptedFileStore(dir));
  const saved = (id: string | undefined) =>
    db.repo.query("cameras.list", {}).rows.find((row) => row.id === id);

  const found = await cameras.upsert({
    name: "Calving pen",
    onvifXaddr,
    username: "farmer",
    password: "barn",
  });
  // The login reaches the camera, and the saved address carries none.
  expect(logins).toContain("farmer");
  expect(saved(found.ids[0])?.rtspUrl).toBe("rtsp://127.0.0.1:554/stream1");

  // A camera that does not answer is still saved, without a stream address.
  await camera.stop(true);
  const silent = await cameras.upsert({ name: "Yard", onvifXaddr });
  expect(saved(silent.ids[0])).toMatchObject({ name: "Yard", rtspUrl: null });
});
