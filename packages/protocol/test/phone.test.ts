import { expect, test } from "bun:test";
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeError,
  encodeRequest,
  validateResult,
} from "../src/codec";

test("pages.read keeps its page id separate from correlation and validates asset results", () => {
  expect(
    decodeClientMessage(encodeRequest("request-1", "pages.read", { pageId: "board", path: "" })),
  ).toEqual({
    ok: true,
    value: { id: "request-1", type: "pages.read", pageId: "board", path: "" },
  });
  expect(decodeClientMessage('{"id":"request-1","type":"pages.read","path":""}').ok).toBe(false);
  expect(validateResult("pages.read", { contentType: "text/html", data: "eA==", size: 1 }).ok).toBe(
    true,
  );
  expect(
    validateResult("pages.read", { contentType: "text/html", data: "eA==", size: -1 }).ok,
  ).toBe(false);
  expect(
    decodeServerMessage(encodeError("request-1", { code: "too_large", message: "Too large" })).ok,
  ).toBe(true);
});

test("phoneAccess updates accept only a boolean", () => {
  expect(
    decodeClientMessage(encodeRequest("request-2", "settings.update", { phoneAccess: true })).ok,
  ).toBe(true);
  expect(
    decodeClientMessage('{"id":"request-2","type":"settings.update","phoneAccess":"yes"}').ok,
  ).toBe(false);
});
