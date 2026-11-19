#!/usr/bin/env bun
// Prints what Liv is told in a new conversation on a fresh install: starts Liv with the mock model
// in a throwaway data folder, opens one chat and prints the context report it wrote.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLivClient } from "@liv/protocol/client";
import { CONTEXT_REPORT_FILE } from "./agent/hub";
import { startLiv } from "./app";

process.env.LIV_SECRETS = "file";
process.env.LIV_MOCK_DELAY_MS = "0";

const dataDir = mkdtempSync(join(tmpdir(), "liv-context-"));
const token = "context";
const app = await startLiv({
  port: 0,
  token,
  dataDir,
  mockModel: true,
  seed: false,
  gatewayUrl: null,
  appSource: null,
});
const client = createLivClient(`ws://127.0.0.1:${app.port}/ws`, token, { reconnect: false });
try {
  await client.ready();
  const { session } = await client.request("sessions.create", {});
  const settled = new Promise<void>((resolve) => {
    client.on("agent.settled", (event) => {
      if (event.sessionId === session.id) resolve();
    });
  });
  await client.request("chat.prompt", { sessionId: session.id, text: "hello" });
  await settled;
  process.stdout.write(readFileSync(join(dataDir, CONTEXT_REPORT_FILE), "utf8"));
} finally {
  client.close();
  await app.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
