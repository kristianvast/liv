import { ALERT_KINDS, pg } from "@liv/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type CoreDb, farmMembers, pushDevices } from "./db";
import type { FetchLike } from "./shape";

export interface PushOptions {
  readonly projectId: string;
  readonly accessToken: () => Promise<string>;
  readonly fetch?: FetchLike;
}
type AlertKind = (typeof ALERT_KINDS)[number];
export type LivKind = "liv_done" | "liv_needs_you";
type PushMessage = {
  readonly notification: Record<string, string | readonly string[]>;
  readonly data: Readonly<Record<string, string>>;
};
const titles = {
  calving_alert: "push_calving_title",
  health_event: "push_health_title",
  heat_alert: "push_heat_title",
  liv_done: "push_liv_done_title",
  liv_needs_you: "push_liv_needs_title",
} as const;

/** Deferred work is outside the request's failure path, including DB and credential failures. */
export function afterResponse(work: () => Promise<void>) {
  setTimeout(() => {
    void work().catch((error: unknown) => {
      console.warn("Push delivery failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 0);
}

export function createPush(db: CoreDb, options?: PushOptions) {
  async function send(userIds: readonly string[], message: PushMessage) {
    if (!options?.projectId || userIds.length === 0) return;
    const devices = await db
      .select()
      .from(pushDevices)
      .where(inArray(pushDevices.userId, [...userIds]));
    if (devices.length === 0) return;
    const token = await options.accessToken();
    await Promise.all(
      devices.map(async (device) => {
        const response = await (options.fetch ?? fetch)(
          `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              message: {
                token: device.token,
                android: { priority: "HIGH", notification: message.notification },
                data: message.data,
              },
            }),
          },
        );
        const body = await response.text();
        if (response.status === 404 || (!response.ok && body.includes('"UNREGISTERED"'))) {
          await db
            .delete(pushDevices)
            .where(
              and(
                eq(pushDevices.token, device.token),
                eq(pushDevices.userId, device.userId),
                eq(pushDevices.updatedAt, device.updatedAt),
              ),
            );
        } else if (!response.ok) {
          console.warn("FCM delivery rejected", { status: response.status });
        }
      }),
    );
  }
  return {
    async observations(ids: readonly string[], now: Date) {
      if (!options?.projectId || ids.length === 0) return;
      const observations = await db
        .select()
        .from(pg.observations)
        .where(inArray(pg.observations.id, [...ids]));
      for (const row of observations) {
        const kind = ALERT_KINDS.find((kind) => kind === row.kind);
        const age = now.getTime() - Date.parse(row.ts);
        if (!kind || row.deletedAt !== null || age < 0 || age > 86_400_000) continue;
        const [animal] = row.animalId
          ? await db
              .select()
              .from(pg.animals)
              .where(and(eq(pg.animals.id, row.animalId), eq(pg.animals.farmId, row.farmId)))
          : [];
        const name = animal?.name || animal?.earTagNumber;
        const members = await db
          .select({ userId: farmMembers.userId })
          .from(farmMembers)
          .where(eq(farmMembers.farmId, row.farmId));
        await send(
          members.map((member) => member.userId),
          {
            notification: {
              channel_id: "alerts",
              title_loc_key: titles[kind satisfies AlertKind],
              body_loc_key: name ? "push_alert_body_named" : "push_alert_body_unnamed",
              ...(name ? { body_loc_args: [name] } : {}),
            },
            data: { kind, farmId: row.farmId, observationId: row.id, animalId: row.animalId ?? "" },
          },
        );
      }
    },
    async notify(
      userId: string,
      notification: {
        readonly kind: LivKind;
        readonly farmId: string;
        readonly sessionId: string;
        readonly title: string;
      },
    ) {
      await send([userId], {
        notification: {
          channel_id: "liv",
          title_loc_key: titles[notification.kind],
          body: notification.title,
        },
        data: {
          kind: notification.kind,
          farmId: notification.farmId,
          sessionId: notification.sessionId,
        },
      });
    },
  };
}
