// Draws every Liv app picture from the Agrointel bull mark (the logo on agrointel.no) on a navy tile:
// the Tauri icon set, the web favicon and touch icon, and the Android launcher picture.
// Run from the repo root: bun apps/liv/scripts/generate-icons.ts [path/to/agrointel-symbol-dark.png]
// The default source is the website checkout next to this repo. Needs rsvg-convert and sips (macOS).
// Afterwards re-render the Windows installer art: bun apps/liv/src-tauri/windows/render-installer-art.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const app = join(import.meta.dir, "..");
const icons = join(app, "src-tauri/icons");
const source =
  process.argv[2] ??
  join(app, "../../../barnstar-website/shared/logo/agrointel/agrointel-symbol-dark.png");
const work = mkdtempSync(join(tmpdir(), "liv-icons-"));

async function embedded(size: number): Promise<string> {
  const out = join(work, `mark-${size}.png`);
  await $`sips -Z ${size} ${source} --out ${out}`.quiet();
  return Buffer.from(await Bun.file(out).arrayBuffer()).toString("base64");
}

function tile(markPng: string): string {
  const href = `data:image/png;base64,${markPng}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Liv">
  <title>Liv</title>
  <rect width="512" height="512" rx="114" fill="#0a0f1c"/>
  <image x="72" y="72" width="368" height="368" href="${href}" xlink:href="${href}"/>
</svg>
`;
}

try {
  const iconSvg = join(icons, "icon.svg");
  await Bun.write(iconSvg, tile(await embedded(512)));
  await Bun.write(join(app, "public/favicon.svg"), tile(await embedded(128)));

  const master = join(work, "icon-1024.png");
  await $`rsvg-convert -w 1024 -h 1024 ${iconSvg} -o ${master}`;
  await $`${join(app, "node_modules/.bin/tauri")} icon ${master} -o ${join(work, "tauri")}`.quiet();
  for (const name of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico"]) {
    await Bun.write(join(icons, name), Bun.file(join(work, "tauri", name)));
  }
  await $`rsvg-convert -w 512 -h 512 ${iconSvg} -o ${join(icons, "icon.png")}`;
  await $`rsvg-convert -w 180 -h 180 ${iconSvg} -o ${join(app, "public/apple-touch-icon.png")}`;
  await $`rsvg-convert -w 512 -h 512 ${iconSvg} -o ${join(app, "../android/app/src/main/res/drawable-nodpi/liv_orb.png")}`;
} finally {
  rmSync(work, { recursive: true, force: true });
}
