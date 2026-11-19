// Command-line and environment configuration for the Liv sidecar.
import { existsSync, readdirSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface LivConfig {
  /** 0 = let the OS pick a free port. */
  port: number;
  token: string;
  dataDir: string;
  mockModel: boolean;
  seed: boolean;
  /** Core LLM gateway base URL (env LIV_GATEWAY_URL); enables the liv-gateway provider. */
  gatewayUrl: string | null;
  /** Liv cloud (Core) base URL (--core-url or LIV_CORE_URL): accounts, sync, cloud model. */
  coreUrl?: string | null;
  /** Website for Google sign-in (env LIV_SITE_URL); https://agrointel.no when unset. */
  siteUrl?: string | null;
  /** Liv source checkout Liv may edit (--app-source or LIV_APP_SOURCE); null in installed builds. */
  appSource: string | null;
  /** Skill catalog: http(s) base URL or local folder (--skills-url or LIV_SKILLS_URL). */
  skillsUrl?: string | null;
  /** Exit when stdin closes (--parent-watch): the desktop shell holds the pipe, so a killed shell never leaves Liv orphaned. */
  parentWatch?: boolean;
  /** Shuts Liv down cleanly so its parent starts it again; set only when a parent will. */
  restart?: () => void;
  /** Starts Liv again on the same port (another farm folder); the shell's restart or in-process. */
  reopen?: () => void;
}

/** Data folder names from before the Liv rename, keyed by the name that replaced them. */
const LEGACY_DATA_DIRS: Record<string, string> = {
  "no.agrointel.liv": "no.agrointel.orbit",
  Liv: "Orbit",
};

/**
 * Moves an install's data folder over from its name before the Liv rename, when the new folder is
 * missing or still empty. Only a folder holding the old database counts, never another app's.
 */
export function adoptLegacyDataDir(dataDir: string): void {
  const legacyName = LEGACY_DATA_DIRS[basename(dataDir)];
  if (!legacyName) return;
  const legacy = join(dirname(dataDir), legacyName);
  if (!existsSync(join(legacy, "orbit.sqlite"))) return;
  if (existsSync(dataDir)) {
    if (readdirSync(dataDir).length > 0) return;
    rmdirSync(dataDir);
  }
  renameSync(legacy, dataDir);
}

/** OS application-data directory for Liv (Windows %APPDATA%, macOS Application Support, XDG on Linux). */
export function defaultDataDir(): string {
  const home = homedir();
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Liv");
  }
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "Liv");
  return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "Liv");
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

/** Parses `--flag value`, `--flag=value` and bare boolean flags. */
export function parseConfig(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): LivConfig {
  const values = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) throw new ConfigError(`unexpected argument: ${arg}`);
    const eq = arg.indexOf("=");
    if (eq > 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (["port", "token", "data-dir", "app-source", "core-url", "skills-url"].includes(name)) {
      if (next === undefined) throw new ConfigError(`--${name} needs a value`);
      values.set(name, next);
      i++;
    } else {
      values.set(name, true);
    }
  }
  const known = new Set([
    "port",
    "token",
    "data-dir",
    "app-source",
    "core-url",
    "skills-url",
    "mock-model",
    "seed",
    "dev",
    "parent-watch",
  ]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new ConfigError(`unknown option: --${key}`);
  }
  const dev = values.get("dev") === true;
  const str = (name: string): string | undefined => {
    const v = values.get(name);
    return typeof v === "string" ? v : undefined;
  };

  const portRaw = str("port") ?? env.LIV_PORT ?? (dev ? "7717" : "0");
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`invalid --port: ${portRaw}`);
  }
  const token = str("token") ?? env.LIV_TOKEN ?? (dev ? "dev" : undefined);
  if (!token) throw new ConfigError("--token (or LIV_TOKEN) is required");
  const appSourceRaw = str("app-source") ?? env.LIV_APP_SOURCE?.trim();
  const appSource = appSourceRaw ? resolve(appSourceRaw) : null;
  if (appSource && !existsSync(join(appSource, "apps", "liv", "package.json"))) {
    throw new ConfigError(`--app-source ${appSource} is not a Liv checkout (no apps/liv)`);
  }

  return {
    port,
    token,
    dataDir: resolve(str("data-dir") ?? env.LIV_DATA_DIR ?? defaultDataDir()),
    mockModel: values.get("mock-model") === true || truthy(env.LIV_MOCK_MODEL),
    seed: values.get("seed") === true || truthy(env.LIV_SEED),
    gatewayUrl: env.LIV_GATEWAY_URL?.trim() || null,
    coreUrl: (str("core-url") ?? env.LIV_CORE_URL)?.trim().replace(/\/+$/, "") || null,
    siteUrl: env.LIV_SITE_URL?.trim().replace(/\/+$/, "") || null,
    appSource,
    skillsUrl: (str("skills-url") ?? env.LIV_SKILLS_URL)?.trim() || null,
    parentWatch: values.get("parent-watch") === true,
  };
}
