import { DEV_SERVER_URL } from "@liv/protocol";
import type { LivEndpoint } from "../../lib/liv";

export type PageTheme = "light" | "dark";

/**
 * URL of a page or card file on Liv's origin. The frame cannot see the app around it, so the
 * app's theme and language travel in the query string and Liv's page helper applies them.
 */
export function customPageUrl(
  endpoint: LivEndpoint | null,
  path: string,
  look: { theme: PageTheme; lang: string },
): string {
  const origin = new URL(endpoint?.url ?? DEV_SERVER_URL);
  origin.protocol = origin.protocol === "wss:" ? "https:" : "http:";
  const url = new URL(path, origin.origin);
  url.searchParams.set("theme", look.theme);
  url.searchParams.set("lang", look.lang);
  return url.toString();
}
