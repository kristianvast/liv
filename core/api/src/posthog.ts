import type { FetchLike } from "./shape";

type Checkout = {
  readonly plan: string | null;
  readonly interval: "month" | "year" | null;
  readonly kind: "plan" | "hardware" | "both";
};

type EventProperties = {
  readonly account_created: {
    readonly source: "app" | "web";
    readonly method: "password" | "google";
  };
  readonly checkout_started: Checkout & { readonly account: "personal" | "farm" };
  readonly checkout_completed: Checkout;
  readonly orion_request: {
    readonly model: string | null;
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly status: number;
    readonly plan: string;
  };
  readonly voice_used: { readonly seconds: number; readonly model: string };
  readonly app_first_launch: {
    readonly os: "windows" | "macos" | "linux";
    readonly app_version: string;
  };
};

export type ProductEvent = {
  [E in keyof EventProperties]: {
    readonly event: E;
    readonly distinct_id: string;
    readonly properties: EventProperties[E];
  };
}[keyof EventProperties];

export type Capture = (event: ProductEvent) => void;

export interface PosthogOptions {
  readonly key?: string;
  readonly host?: string;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
}

/** Best effort only. Each instance logs its first delivery failure, without payloads or credentials. */
export function createPosthog(options: PosthogOptions = {}): Capture {
  let warned = false;
  return (event) => {
    if (!options.key) return;
    const timestamp = (options.now?.() ?? new Date()).toISOString();
    // Defer both network I/O and serialization beyond the caller's request work.
    setTimeout(() => {
      void (async () => {
        try {
          const response = await (options.fetch ?? fetch)(
            `${(options.host ?? "https://eu.i.posthog.com").replace(/\/+$/, "")}/batch/`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              signal: AbortSignal.timeout(2000),
              body: JSON.stringify({
                api_key: options.key,
                batch: [
                  {
                    ...event,
                    properties: {
                      ...event.properties,
                      $geoip_disable: true,
                      ...(event.event === "app_first_launch"
                        ? { $process_person_profile: false }
                        : {}),
                    },
                    timestamp,
                  },
                ],
              }),
            },
          );
          await response.body?.cancel();
          if (!response.ok && !warned) {
            warned = true;
            console.warn("PostHog capture failed", { status: response.status });
          }
        } catch (error) {
          // This outbound boundary must never reject into account, billing or metering work.
          if (!warned) {
            warned = true;
            console.warn("PostHog capture failed", {
              error: error instanceof Error ? error.name : "UnknownError",
            });
          }
        }
      })();
    }, 0);
  };
}

/** Orion sends "Orbit on <hostname>"; browsers send "Website", another label, or no label. */
export function accountSource(deviceName: string | null): "app" | "web" {
  return /^Orbit on \S/i.test(deviceName ?? "") ? "app" : "web";
}
