import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_FILES, PAGE_KIT_CSS } from "../src/resources";
import * as pages from "../src/services/pages";
import { connect, removeDir, startApp, tempDir } from "./helpers";
import { phoneFixture } from "./phone-helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup() {
  const dir = tempDir();
  const app = await startApp(dir);
  const client = await connect(app);
  cleanups.push(async () => {
    client.close();
    await app.stop();
    removeDir(dir);
  });
  const page = join(dir, "workspace", "pages", "board");
  mkdirSync(page, { recursive: true });
  writeFileSync(join(page, "index.html"), "<h1>Board</h1>");
  return { client, page, dir };
}

test("pages.read returns file bytes, MIME and byte length for the entry and page kit assets", async () => {
  const { client } = await setup();
  for (const path of ["", "index.html"]) {
    const result = await client.request("pages.read", { pageId: "board", path });
    expect(Buffer.from(result.data, "base64").toString()).toBe("<h1>Board</h1>");
    expect(result.size).toBe(Buffer.byteLength("<h1>Board</h1>"));
    expect(result.contentType).toContain("text/html");
  }
  const css = await client.request("pages.read", { pageId: "_orbit.css", path: "" });
  expect(Buffer.from(css.data, "base64").toString()).toBe(PAGE_KIT_CSS);
  expect(css.contentType).toBe("text/css; charset=utf-8");
  const font = await client.request("pages.read", {
    pageId: "_fonts",
    path: "switzer-400-normal.woff2",
  });
  const fontPath = FONT_FILES["switzer-400-normal.woff2"];
  if (!fontPath) throw new Error("Missing Switzer font resource");
  expect(Buffer.from(font.data, "base64")).toEqual(
    Buffer.from(await Bun.file(fontPath).arrayBuffer()),
  );
  expect(font.contentType).toBe("font/woff2");
});

test.each([
  ["board", "../../AGENTS.md"],
  ["../board", "index.html"],
  ["board", "missing.html"],
  ["board", "escape.html"],
  ["_fonts", "../settings.json"],
  ["_fonts", "absent.woff2"],
  ["_orbit.css", "extra"],
  ["_orbit.js", ""],
])("pages.read refuses missing or escaping file %s/%s", async (pageId, path) => {
  const { client, page, dir } = await setup();
  writeFileSync(join(dir, "outside.html"), "secret");
  symlinkSync(join(dir, "outside.html"), join(page, "escape.html"));
  const error = await client
    .request("pages.read", { pageId, path })
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ code: "not_found" });
});

test("pages.read accepts exactly 4 MiB and refuses a file one byte larger", async () => {
  const { client, page } = await setup();
  writeFileSync(join(page, "limit.bin"), Buffer.alloc(4 * 1024 * 1024, 7));
  writeFileSync(join(page, "large.bin"), Buffer.alloc(4 * 1024 * 1024 + 1));
  const result = await client.request("pages.read", { pageId: "board", path: "limit.bin" });
  expect(result.size).toBe(4 * 1024 * 1024);
  expect(Buffer.from(result.data, "base64").length).toBe(4 * 1024 * 1024);
  const error = await client
    .request("pages.read", { pageId: "board", path: "large.bin" })
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ code: "too_large" });
});

test("pages.read transports a 2 MiB page asset intact through the relay", async () => {
  const fixture = await phoneFixture();
  const page = join(fixture.dir, "workspace", "pages", "board");
  mkdirSync(page, { recursive: true });
  writeFileSync(join(page, "index.html"), "<h1>Remote board</h1>");
  const bytes = Buffer.alloc(2 * 1024 * 1024, "Orbit phone asset");
  writeFileSync(join(page, "asset.bin"), bytes);
  await fixture.signIn();
  await fixture.local.request("settings.update", { phoneAccess: true });
  await fixture.hosts.next();
  const remote = await fixture.remote();
  const result = await remote.request("pages.read", { pageId: "board", path: "asset.bin" });
  expect(result.size).toBe(bytes.length);
  expect(Buffer.from(result.data, "base64")).toEqual(bytes);
});

test("pages.read returns not_found when a resolved file disappears before it is read", async () => {
  const { client, dir } = await setup();
  const resolved = spyOn(pages, "resolvePageFile").mockReturnValue(join(dir, "disappeared.html"));
  try {
    const error = await client
      .request("pages.read", { pageId: "board", path: "" })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "not_found" });
  } finally {
    resolved.mockRestore();
  }
});
