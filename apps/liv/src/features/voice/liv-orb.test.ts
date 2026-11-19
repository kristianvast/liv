import { describe, expect, it } from "vitest";
import { trackChips } from "./liv-orb";
import type { ActivityRowView } from "./types";

function row(id: string, status: ActivityRowView["status"]): ActivityRowView {
  return { id, name: "db_query", text: id, chipLabel: id, status, startedAt: 0, canStop: false };
}

describe("tool chips around the orb", () => {
  it("keeps a tool's place in time when the orb is drawn again, and launches only a new tool", () => {
    trackChips([row("a", "running")], 10);
    const [finished] = trackChips([row("a", "done")], 12);
    expect(finished).toMatchObject({ startedAtSec: 10, endedAtSec: 12 });

    // A fresh orb (the farmer came back to Home) asks for the same tools later on.
    const again = trackChips([row("a", "done"), row("b", "running")], 40);
    expect(again[0]).toMatchObject({ id: "a", startedAtSec: 10, endedAtSec: 12 });
    expect(again[1]).toMatchObject({ id: "b", startedAtSec: 40 });
  });
});
