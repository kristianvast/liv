import type { CameraInput, DbMutateResult } from "@orbit/protocol";
import { Cam, Discovery } from "onvif";
import type { Repository, WriteOrigin } from "../db/repo";
import type { SecretStore } from "../secrets";

export interface DiscoveredCamera {
  /** WS-Discovery endpoint reference (urn:uuid:...). */
  urn: string;
  xaddr: string | null;
  host: string | null;
  manufacturer: string | null;
  model: string | null;
  name: string | null;
}

interface RawProbeMatch {
  probeMatches?: {
    probeMatch?: {
      endpointReference?: { address?: string };
      XAddrs?: string;
      scopes?: string | { _?: string };
    };
  };
}

function scopeValue(scopes: string[], key: string): string | null {
  const prefix = `onvif://www.onvif.org/${key}/`;
  const hit = scopes.find((s) => s.toLowerCase().startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)).replaceAll("_", " ") : null;
}

export function parseProbeMatch(raw: RawProbeMatch): DiscoveredCamera | null {
  const match = raw.probeMatches?.probeMatch;
  const urn = match?.endpointReference?.address;
  if (!match || !urn) return null;
  const scopeText = typeof match.scopes === "string" ? match.scopes : (match.scopes?._ ?? "");
  const scopes = scopeText.split(/\s+/).filter(Boolean);
  const xaddr = match.XAddrs?.split(/\s+/).find(Boolean) ?? null;
  let host: string | null = null;
  try {
    host = xaddr ? new URL(xaddr).hostname : null;
  } catch {
    host = null;
  }
  const name = scopeValue(scopes, "name");
  return {
    urn,
    xaddr,
    host,
    manufacturer: scopeValue(scopes, "mfr") ?? scopeValue(scopes, "manufacturer") ?? name,
    model: scopeValue(scopes, "hardware"),
    name,
  };
}

export type CameraLogin = { username?: string; password?: string };

/** One ONVIF call as a promise. */
function ask<T>(call: (done: (error: Error | null, value?: T) => void) => void): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    call((error, value) => (error ? reject(error) : resolvePromise(value as T)));
  });
}

/**
 * Asks an ONVIF camera for the RTSP address of its first video profile, without a login in it.
 * The steps are made one by one instead of through the library's `connect`, which throws from
 * inside a network callback when a camera lists a video source without a matching profile.
 */
export async function resolveStreamUrl(
  xaddr: string,
  login: CameraLogin,
  timeoutMs = 6000,
): Promise<string> {
  const device = new URL(xaddr);
  const secure = device.protocol === "https:";
  const cam = new Cam({
    hostname: device.hostname,
    port: Number(device.port) || (secure ? 443 : 80),
    path: device.pathname,
    useSecure: secure,
    username: login.username,
    password: login.password,
    timeout: timeoutMs,
    autoconnect: false,
  });
  // The camera's clock comes first: the login is signed with the camera's time.
  await ask<Date>((done) => cam.getSystemDateAndTime(done));
  // Newer cameras list their services; the first ONVIF version only had GetCapabilities.
  await ask((done) => cam.getServices(true, done)).catch(() =>
    ask((done) => cam.getCapabilities(done)),
  );
  await ask((done) => cam.getProfiles(done));
  const profileToken = cam.profiles?.[0]?.$.token;
  if (!profileToken) throw new Error("the camera lists no video profile");
  const stream = await ask<{ uri: string }>((done) =>
    cam.getStreamUri({ protocol: "RTSP", profileToken }, done),
  );
  const url = new URL(stream.uri);
  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:")
    throw new Error("the camera gave no RTSP address");
  url.username = "";
  url.password = "";
  return url.href;
}

export class CameraService {
  constructor(
    private readonly repo: Repository,
    private readonly secrets: SecretStore,
    private readonly streamUrl: typeof resolveStreamUrl = resolveStreamUrl,
  ) {}

  /**
   * ONVIF WS-Discovery on the LAN. ORION_FAKE_CAMERAS (JSON array of DiscoveredCamera) replaces the
   * network probe for tests and demos.
   */
  async discover(timeoutMs = 3000): Promise<DiscoveredCamera[]> {
    const fake = process.env.ORION_FAKE_CAMERAS;
    if (fake) return JSON.parse(fake) as DiscoveredCamera[];
    const timeout = Math.min(Math.max(timeoutMs, 500), 15_000);
    return new Promise((resolvePromise, reject) => {
      const onError = () => {};
      Discovery.on("error", onError);
      try {
        Discovery.probe({ timeout, resolve: false }, (_errors, found) => {
          Discovery.removeListener("error", onError);
          const cams = ((found ?? []) as RawProbeMatch[])
            .map(parseProbeMatch)
            .filter((c): c is DiscoveredCamera => c !== null);
          resolvePromise(cams);
        });
      } catch (error) {
        Discovery.removeListener("error", onError);
        reject(error);
      }
    });
  }

  /**
   * Stores credentials in the secret store; the database only gets credential_ref. A camera saved
   * with its ONVIF address but no stream address is asked for one, so a camera found by
   * `discover` shows live video without anyone typing an RTSP address. A camera that does not
   * answer is still saved, with no stream address.
   */
  async upsert(input: CameraInput, origin?: Partial<WriteOrigin>): Promise<DbMutateResult> {
    const { username, password, ...camera } = input;
    const id = camera.id ?? crypto.randomUUID();
    if (!camera.rtspUrl && camera.onvifXaddr) {
      try {
        camera.rtspUrl = await this.streamUrl(
          camera.onvifXaddr,
          await this.login(camera.id, { username, password }),
        );
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        console.error(`orion: camera "${camera.name}" gave no stream address: ${error.message}`);
      }
    }
    let credentialRef: string | undefined;
    if (password !== undefined || username !== undefined) {
      credentialRef = `camera:${id}`;
      await this.secrets.set(
        credentialRef,
        JSON.stringify({ username: username ?? "", password: password ?? "" }),
      );
    }
    return this.repo.upsertCamera(
      { ...camera, ...(credentialRef ? { credentialRef } : {}) },
      origin,
      camera.id ? undefined : id,
    );
  }

  /** The login given with this save, or the one already kept for an existing camera. */
  private async login(id: string | undefined, given: CameraLogin): Promise<CameraLogin> {
    if (given.username !== undefined || given.password !== undefined || !id) return given;
    const kept = await this.secrets.get(`camera:${id}`);
    return kept ? (JSON.parse(kept) as CameraLogin) : given;
  }
}
