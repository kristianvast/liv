import { getVersion } from "@tauri-apps/api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportFirstLaunch } from "./first-launch";
import { isTauriRuntime } from "./orion";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "0.1.10") }));
vi.mock("./orion", () => ({ isTauriRuntime: vi.fn(() => true) }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(isTauriRuntime).mockReturnValue(true);
  vi.mocked(getVersion).mockResolvedValue("0.1.10");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("first launch", () => {
  it("sends only once across concurrent mounts relaunches and version updates", async () => {
    const outbound = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", outbound);

    await Promise.all([
      reportFirstLaunch("https://core.test"),
      reportFirstLaunch("https://core.test"),
    ]);
    vi.mocked(getVersion).mockResolvedValue("0.1.11");
    await reportFirstLaunch("https://core.test");

    expect(outbound).toHaveBeenCalledTimes(1);
    const body = outbound.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual({
      install_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      os: "windows",
      app_version: "0.1.10",
    });
    expect(outbound.mock.calls[0]?.[1]?.credentials).toBe("omit");
  });

  it("reuses the same install ID after an offline launch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const outbound = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Offline"))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", outbound);

    await reportFirstLaunch("https://core.test");
    await reportFirstLaunch("https://core.test");

    expect(outbound).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(outbound.mock.calls[0]?.[1]?.body));
    const second = JSON.parse(String(outbound.mock.calls[1]?.[1]?.body));
    expect(first.install_id).toBe(second.install_id);
  });

  it("does not report launches from browser development", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    const outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    await reportFirstLaunch("https://core.test");
    expect(outbound).not.toHaveBeenCalled();
  });
});
