// Everything Liv is told at the start of a chat, in the order she reads it. The words live in
// resources/prompt/*.md (resources/README.md maps them); only the parts that depend on this
// computer are built here.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIV_ABOUT } from "@liv/protocol";
import role from "../../resources/prompt/1-role.md" with { type: "text" };
import howYouWork from "../../resources/prompt/2-how-you-work.md" with { type: "text" };
import askFirst from "../../resources/prompt/3-ask-first.md" with { type: "text" };
import theLivApp from "../../resources/prompt/4-the-liv-app.md" with { type: "text" };
import feedbackAndSharing from "../../resources/prompt/5-feedback-and-sharing.md" with {
  type: "text",
};
import { bundledShell } from "./shell";

export interface PromptSection {
  /** Where to edit this part, relative to the repository root. */
  source: string;
  text: string;
}

const PROMPT_DIR = "packages/liv/resources/prompt";
const THIS_FILE = "packages/liv/src/agent/prompt.ts";

const FILES: readonly PromptSection[] = [
  { source: `${PROMPT_DIR}/1-role.md`, text: role },
  { source: `${PROMPT_DIR}/2-how-you-work.md`, text: howYouWork },
  { source: `${PROMPT_DIR}/3-ask-first.md`, text: askFirst },
  { source: `${PROMPT_DIR}/4-the-liv-app.md`, text: theLivApp },
  { source: `${PROMPT_DIR}/5-feedback-and-sharing.md`, text: feedbackAndSharing },
  { source: "packages/protocol/src/about.ts", text: LIV_ABOUT },
];

const SYSTEM_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

export interface ComputerFacts {
  dataDir: string;
  version: string;
  checkoutDir: string;
  appSource: string | null;
  workspaceDir: string;
  localLivError?: string | null;
}

/** The facts Liv would otherwise probe for: which system, which shell, which version, which folders. */
export function computerPrompt(
  opts: ComputerFacts,
  platform: NodeJS.Platform = process.platform,
  hasBash = platform !== "win32" || bundledShell() !== null,
): string {
  const shell =
    platform !== "win32"
      ? "bash"
      : hasBash
        ? "powershell for Windows commands, and bash with git (both ship with Liv, nothing to install)"
        : "powershell (this computer has no bash, so do not call it)";
  const checkout = opts.appSource
    ? []
    : [
        `- Liv's source, only for changing Liv itself with the editing-liv skill: ${opts.checkoutDir}${existsSync(join(opts.checkoutDir, "apps", "liv", "package.json")) ? "" : " (not downloaded yet)"}`,
      ];
  return [
    "This computer:",
    `- System: ${SYSTEM_NAMES[platform] ?? platform}. Shell tool: ${shell}.`,
    `- Liv version: ${opts.version}.`,
    `- Farm workspace, your working directory: ${opts.workspaceDir}`,
    `- Liv's data folder: ${opts.dataDir}. It holds the database liv.sqlite, which you never open or edit; use the farm tools.`,
    ...checkout,
    ...(opts.localLivError
      ? [
          `- Your own change to Liv is switched off and the original Liv is running: ${opts.localLivError} Tell the farmer, and fix it in the source before building again.`,
        ]
      : []),
  ].join("\n");
}

function appSourcePrompt(dir: string): string {
  return `Liv's own source code is checked out at ${dir}, and you may change the app itself there.
The UI is in ${join(dir, "apps/liv/src")} (React + Vite; the running dev app reloads on save). Liv, the agent you are, is in ${join(dir, "packages/liv")} and restarts on save in dev.
Follow that checkout's AGENTS.md. After a change, run \`bun run typecheck\` and the affected package's tests from ${dir}, and fix what you broke. Never run cargo, tauri or other heavy builds there. Prefer a custom page when the farmer only needs a new screen.`;
}

/** Liv's system prompt as its parts, in order. Pi adds AGENTS.md, memory and the skill list after it. */
export function promptSections(
  opts: ComputerFacts & { farmCodeNotice?: string | null },
): PromptSection[] {
  return [
    ...FILES,
    ...(opts.farmCodeNotice
      ? [
          {
            source: "packages/liv/src/services/farm-code.ts",
            text: `Farm code sync: ${opts.farmCodeNotice}`,
          },
        ]
      : []),
    { source: `${THIS_FILE} (computerPrompt)`, text: computerPrompt(opts) },
    ...(opts.appSource
      ? [{ source: `${THIS_FILE} (appSourcePrompt)`, text: appSourcePrompt(opts.appSource) }]
      : []),
  ];
}

export function joinSections(sections: readonly PromptSection[]): string {
  return `${sections.map((s) => s.text.trim()).join("\n\n")}\n`;
}

export interface ContextReport {
  sessionId: string;
  model: string;
  sections: readonly PromptSection[];
  /** The whole prompt the model got, with what Pi added (AGENTS.md, memory, skills). */
  systemPrompt: string;
  tools: ReadonlyArray<{ name: string; description: string }>;
}

/** Rough size: about four characters to a token. */
const tokens = (text: string) => Math.round(text.length / 4);

/** Writes what a conversation was really told, part by part with sizes, to read after the fact. */
export function writeContextReport(file: string, report: ContextReport): void {
  const own = joinSections(report.sections);
  const toolText = report.tools.map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n");
  const row = (name: string, text: string) => `| ${name} | ${text.length} | ${tokens(text)} |`;
  writeFileSync(
    file,
    [
      "# What Liv was told",
      "",
      `Conversation ${report.sessionId}, model ${report.model}, written ${new Date().toISOString()}.`,
      "Each part names the file to edit. Pi's own file and shell tools are not listed.",
      "",
      "| Part | Characters | About tokens |",
      "| --- | ---: | ---: |",
      ...report.sections.map((s) => row(s.source, s.text)),
      row(
        "Added by Pi: AGENTS.md files, memory, skill list",
        report.systemPrompt.slice(Math.min(own.length, report.systemPrompt.length)),
      ),
      row("System prompt in all", report.systemPrompt),
      row(`Tool descriptions (${report.tools.length} tools)`, toolText),
      "",
      "## Tools",
      "",
      toolText,
      "",
      "## System prompt",
      "",
      report.systemPrompt,
      "",
    ].join("\n"),
  );
}
