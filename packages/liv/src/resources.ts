// Liv's own resources, embedded into the module graph so `bun build --compile` bundles them.
// At startup they are written to <data-dir>/resources, because Pi and the connector scaffolder
// read from real directories.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import azeretMono from "../../../apps/liv/public/fonts/azeret-mono-latin-wght-normal.woff2" with {
  type: "file",
};
import switzer400 from "../../../apps/liv/public/fonts/switzer-400-normal.woff2" with {
  type: "file",
};
import switzer500 from "../../../apps/liv/public/fonts/switzer-500-normal.woff2" with {
  type: "file",
};
import switzer600 from "../../../apps/liv/public/fonts/switzer-600-normal.woff2" with {
  type: "file",
};
import switzer700 from "../../../apps/liv/public/fonts/switzer-700-normal.woff2" with {
  type: "file",
};
import tanker400 from "../../../apps/liv/public/fonts/tanker-400-normal.woff2" with {
  type: "file",
};
import appTokensCss from "../../../apps/liv/src/design/tokens.css" with { type: "text" };
import templateFixture from "../../connectors/template/fixture.csv" with { type: "text" };
import templateIndex from "../../connectors/template/index.ts" with { type: "text" };
import templateReadme from "../../connectors/template/README.md" with { type: "text" };
import agentsMd from "../resources/AGENTS.md" with { type: "text" };
import pageKitCss from "../resources/pages/kit.css" with { type: "text" };
import buildingFeaturesSkill from "../resources/skills/building-features/SKILL.md" with {
  type: "text",
};
import camerasSkill from "../resources/skills/cameras/SKILL.md" with { type: "text" };
import connectorsSkill from "../resources/skills/connectors/SKILL.md" with { type: "text" };
import customPagesSkill from "../resources/skills/custom-pages/SKILL.md" with { type: "text" };
import editingLivSkill from "../resources/skills/editing-liv/SKILL.md" with { type: "text" };
import herdDataSkill from "../resources/skills/herd-data/SKILL.md" with { type: "text" };
import uiDesignSkill from "../resources/skills/ui-design/SKILL.md" with { type: "text" };
import updatingLivSkill from "../resources/skills/updating-liv/SKILL.md" with { type: "text" };

// The text loader yields a string, but TypeScript types a .ts import as its module shape.
const asText = (value: unknown): string => value as string;

/** Relative path inside <data-dir>/resources -> file contents. */
export const EMBEDDED_RESOURCES: Readonly<Record<string, string>> = {
  "AGENTS.md": asText(agentsMd),
  "skills/building-features/SKILL.md": asText(buildingFeaturesSkill),
  "skills/cameras/SKILL.md": asText(camerasSkill),
  "skills/connectors/SKILL.md": asText(connectorsSkill),
  "skills/custom-pages/SKILL.md": asText(customPagesSkill),
  "skills/editing-liv/SKILL.md": asText(editingLivSkill),
  "skills/herd-data/SKILL.md": asText(herdDataSkill),
  "skills/ui-design/SKILL.md": asText(uiDesignSkill),
  "skills/updating-liv/SKILL.md": asText(updatingLivSkill),
  "connector-template/README.md": asText(templateReadme),
  "connector-template/fixture.csv": asText(templateFixture),
  "connector-template/index.ts": asText(templateIndex),
};

/**
 * Stylesheet custom pages load as ../_liv.css: the app's own design tokens and primitives, then
 * the page kit, so a page looks like the rest of Liv without copying any of it.
 */
export const PAGE_KIT_CSS = `${asText(appTokensCss)}\n${asText(pageKitCss)}`;

/** The app's font files by name. The tokens load them from /fonts/<name>. */
export const FONT_FILES: Readonly<Record<string, string>> = {
  "azeret-mono-latin-wght-normal.woff2": azeretMono,
  "switzer-400-normal.woff2": switzer400,
  "switzer-500-normal.woff2": switzer500,
  "switzer-600-normal.woff2": switzer600,
  "switzer-700-normal.woff2": switzer700,
  "tanker-400-normal.woff2": tanker400,
};

export interface MaterializedResources {
  /** Holds AGENTS.md and skills/ (Pi context file + skill paths). */
  dir: string;
  /** Connector template used by connector_scaffold. */
  connectorTemplateDir: string;
}

/** Rewrites <dataDir>/resources from the embedded copies, so an upgrade replaces stale files. */
export function materializeResources(dataDir: string): MaterializedResources {
  const dir = join(dataDir, "resources");
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(EMBEDDED_RESOURCES)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return { dir, connectorTemplateDir: join(dir, "connector-template") };
}
