import { describe, expect, it } from "vitest";
import { type CaptionAction, captionReducer, INITIAL_CAPTION_STATE } from "./captions";

function run(actions: readonly CaptionAction[]) {
  return actions.reduce(captionReducer, INITIAL_CAPTION_STATE).entries;
}

describe("captions while Orion's reply is still coming", () => {
  it("shows the reply as it streams and keeps one caption when the finished message has another id", () => {
    const streaming = run([
      { type: "stream.part", part: { type: "start", event_id: 7 }, nextId: "c-1" },
      { type: "stream.part", part: { type: "delta", text: "I'll ", event_id: 7 }, nextId: "c-2" },
      { type: "stream.part", part: { type: "delta", text: "check.", event_id: 7 }, nextId: "c-3" },
    ]);
    expect(streaming).toEqual([
      { id: "c-2", role: "assistant", text: "I'll check.", final: false },
    ]);

    const finished = run([
      {
        type: "stream.part",
        part: { type: "delta", text: "I'll check.", event_id: 7 },
        nextId: "c-1",
      },
      { type: "stream.part", part: { type: "stop", event_id: 7 }, nextId: "c-2" },
      {
        type: "final.message",
        role: "assistant",
        text: "I'll check.",
        streamKey: "resp:other",
        nextId: "c-3",
      },
    ]);
    expect(finished).toEqual([{ id: "c-1", role: "assistant", text: "I'll check.", final: true }]);
  });

  it("keeps a second reply apart from an earlier finished one", () => {
    const entries = run([
      {
        type: "stream.part",
        part: { type: "delta", text: "I'll check.", event_id: 7 },
        nextId: "c-1",
      },
      { type: "stream.part", part: { type: "stop", event_id: 7 }, nextId: "c-2" },
      {
        type: "final.message",
        role: "assistant",
        text: "There are 28 animals.",
        streamKey: null,
        nextId: "c-3",
      },
    ]);
    expect(entries.map((entry) => entry.text)).toEqual(["I'll check.", "There are 28 animals."]);
  });
});
