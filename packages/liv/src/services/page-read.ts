import { stat } from "node:fs/promises";
import type { RequestResult } from "@liv/protocol";
import { FONT_FILES, PAGE_KIT_CSS } from "../resources";
import { resolvePageFile } from "./pages";

const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export class PageReadError extends Error {
  constructor(
    readonly code: "not_found" | "too_large",
    message: string,
  ) {
    super(message);
  }
}

/** Reads the same files as the HTTP page route, without exposing a local URL or token. */
export async function readPage(
  workspaceDir: string,
  pageId: string,
  path: string,
): Promise<RequestResult<"pages.read">> {
  if (pageId === "_liv.css" && path === "") {
    const bytes = Buffer.from(PAGE_KIT_CSS);
    return {
      contentType: "text/css; charset=utf-8",
      data: bytes.toString("base64"),
      size: bytes.length,
    };
  }
  const target =
    pageId === "_fonts"
      ? Object.hasOwn(FONT_FILES, path)
        ? FONT_FILES[path]
        : undefined
      : resolvePageFile(workspaceDir, pageId, path);
  const info = target
    ? await stat(target).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      })
    : null;
  if (!target || !info?.isFile()) throw new PageReadError("not_found", "Page file not found.");
  const file = Bun.file(target);
  if (file.size > MAX_PAGE_BYTES) throw new PageReadError("too_large", "Page file exceeds 4 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_PAGE_BYTES)
    throw new PageReadError("too_large", "Page file exceeds 4 MiB.");
  return {
    contentType: pageId === "_fonts" ? "font/woff2" : file.type,
    data: bytes.toString("base64"),
    size: bytes.length,
  };
}
