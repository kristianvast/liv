// Renders the branded Windows installer images (NSIS + WiX) into this folder.
// Run from the repo root: bun apps/liv/src-tauri/windows/render-installer-art.ts
// The art is drawn as SVG with the app's own fonts, rasterised in a headless WebView and
// written as 24-bit BMP, the format both NSIS and WiX load without surprises.

const here = import.meta.dir;
const fonts = `${here}/../../public/fonts`;

const font = async (file: string) =>
  `data:font/woff2;base64,${Buffer.from(await Bun.file(`${fonts}/${file}`).arrayBuffer()).toString("base64")}`;

const fontFaces = `
  @font-face { font-family: Tanker; src: url(${await font("tanker-400-normal.woff2")}) format("woff2"); }
  @font-face { font-family: Switzer; font-weight: 500; src: url(${await font("switzer-500-normal.woff2")}) format("woff2"); }
  @font-face { font-family: Switzer; font-weight: 600; src: url(${await font("switzer-600-normal.woff2")}) format("woff2"); }
`;

const ink = "#181612";
const paper = "#f4f0e6";
const ember = "#e88245";
const field = "#5ec28f";
const muted = "#a99f8c";

// The app icon (icons/icon.svg) as a reusable 512x512 group.
const mark = (id: string) => `
  <mask id="${id}-cut">
    <rect width="512" height="512" fill="#fff"/>
    <g transform="rotate(-28 256 256)"><path d="M 54 256 A 202 70 0 0 0 458 256" fill="none" stroke="#000" stroke-width="32" stroke-linecap="round"/></g>
  </mask>
  <g id="${id}">
    <rect width="512" height="512" rx="114" fill="${ink}"/>
    <g transform="rotate(-28 256 256)"><path d="M 54 256 A 202 70 0 0 1 458 256" fill="none" stroke="${ember}" stroke-opacity="0.38" stroke-width="12" stroke-linecap="round"/></g>
    <path d="M 143 132 A 50 50 0 0 1 243 132 L 243 324 L 319 324 A 50 50 0 0 1 319 424 L 193 424 A 50 50 0 0 1 143 374 Z" fill="${paper}" mask="url(#${id}-cut)"/>
    <g transform="rotate(-28 256 256)"><path d="M 54 256 A 202 70 0 0 0 458 256" fill="none" stroke="${ember}" stroke-width="15" stroke-linecap="round"/></g>
    <circle cx="434" cy="161" r="24" fill="${ink}"/><circle cx="434" cy="161" r="17" fill="${ember}"/>
    <circle cx="78" cy="351" r="15" fill="${ink}"/><circle cx="78" cy="351" r="10" fill="${field}"/>
  </g>`;

const svg = (w: number, h: number, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><style>${fontFaces}</style>${defs}</defs>${body}</svg>`;

// Dark brand panel: night sky glow, two liv rings, the mark, wordmark and a short line.
const panel = (w: number, h: number) => {
  const cx = w / 2;
  return `
    <rect width="${w}" height="${h}" fill="${ink}"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <g transform="rotate(-28 ${cx} ${h * 0.3})" fill="none" stroke-linecap="round">
      <ellipse cx="${cx}" cy="${h * 0.3}" rx="${w * 0.95}" ry="${w * 0.3}" stroke="${ember}" stroke-opacity="0.22" stroke-width="1.2"/>
      <ellipse cx="${cx}" cy="${h * 0.3}" rx="${w * 1.35}" ry="${w * 0.48}" stroke="${paper}" stroke-opacity="0.08" stroke-width="1"/>
    </g>
    <g fill="${paper}">
      <circle cx="${w * 0.14}" cy="${h * 0.07}" r="0.9" opacity="0.5"/>
      <circle cx="${w * 0.82}" cy="${h * 0.05}" r="0.7" opacity="0.4"/>
      <circle cx="${w * 0.9}" cy="${h * 0.42}" r="0.8" opacity="0.35"/>
      <circle cx="${w * 0.08}" cy="${h * 0.5}" r="0.7" opacity="0.3"/>
      <circle cx="${w * 0.7}" cy="${h * 0.62}" r="0.6" opacity="0.25"/>
    </g>
    <circle cx="${w * 0.88}" cy="${h * 0.16}" r="3" fill="${ember}"/>
    <circle cx="${w * 0.1}" cy="${h * 0.43}" r="2.2" fill="${field}"/>
    <use href="#m" transform="translate(${cx - 38} ${h * 0.3 - 38}) scale(${76 / 512})"/>
    <text x="${cx}" y="${h * 0.3 + 82}" text-anchor="middle" font-family="Tanker" font-size="40" letter-spacing="1.5" fill="${paper}">LIV</text>
    <rect x="${cx - 12}" y="${h * 0.3 + 96}" width="24" height="2" rx="1" fill="${ember}"/>
    <text text-anchor="middle" font-family="Switzer" font-weight="500" font-size="11" fill="${muted}">
      <tspan x="${cx}" y="${h * 0.3 + 120}">Your farm, run from</tspan>
      <tspan x="${cx}" y="${h * 0.3 + 135}">your own computer</tspan>
    </text>
    <text x="${cx}" y="${h - 16}" text-anchor="middle" font-family="Switzer" font-weight="600" font-size="9" letter-spacing="1.6" fill="${ember}" opacity="0.85">BY AGROINTEL</text>`;
};

const glow = (cx: string, cy: string) =>
  `<radialGradient id="glow" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${ember}" stop-opacity="0.2"/><stop offset="1" stop-color="${ember}" stop-opacity="0"/></radialGradient>`;

const art: Record<string, string> = {
  // NSIS welcome/finish sidebar.
  "nsis-sidebar.bmp": svg(164, 314, mark("m") + glow("0.5", "0.3"), panel(164, 314)),
  // NSIS header on inner pages: sits left of the page title, on the white header strip.
  "nsis-header.bmp": svg(
    150,
    57,
    mark("m"),
    `<rect width="150" height="57" fill="#fff"/>
     <g transform="rotate(-14 75 28)" fill="none"><ellipse cx="70" cy="30" rx="92" ry="17" stroke="${ember}" stroke-opacity="0.28" stroke-width="1"/></g>
     <circle cx="140" cy="12" r="2" fill="${ember}"/>
     <use href="#m" transform="translate(12 10.5) scale(${36 / 512})"/>
     <text x="56" y="38" font-family="Tanker" font-size="24" letter-spacing="0.8" fill="${ink}">LIV</text>`,
  ),
  // WiX (MSI) welcome/finish dialog: brand panel on the left, white where the dialog text goes.
  "wix-dialog.bmp": svg(
    493,
    312,
    mark("m") + glow("0.5", "0.3"),
    `<rect width="493" height="312" fill="#fff"/>
     <svg width="164" height="312" overflow="hidden">${panel(164, 312)}</svg>
     <rect x="164" width="1" height="312" fill="${ember}" opacity="0.5"/>`,
  ),
  // WiX banner on inner dialogs: the title text sits on the left, so the art stays right.
  "wix-banner.bmp": svg(
    493,
    58,
    mark("m"),
    `<rect width="493" height="58" fill="#fff"/>
     <g transform="rotate(-10 430 29)" fill="none"><ellipse cx="430" cy="29" rx="120" ry="20" stroke="${ember}" stroke-opacity="0.3" stroke-width="1"/></g>
     <circle cx="318" cy="40" r="2" fill="${field}"/>
     <circle cx="478" cy="11" r="2.2" fill="${ember}"/>
     <use href="#m" transform="translate(442 13) scale(${32 / 512})"/>
     <rect y="57" width="493" height="1" fill="${ember}" opacity="0.6"/>`,
  ),
};

// Rasterises an SVG in the WebView and returns tightly packed RGB rows, top to bottom.
async function rasterise(view: Bun.WebView, markup: string, w: number, h: number) {
  const url = `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
  const b64: string = await view.evaluate(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(url)};
    await img.decode();
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement("canvas");
    c.width = ${w}; c.height = ${h};
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, ${w}, ${h});
    const d = g.getImageData(0, 0, ${w}, ${h}).data;
    let s = "";
    for (let i = 0; i < d.length; i += 4) s += String.fromCharCode(d[i], d[i + 1], d[i + 2]);
    return btoa(s);
  })()`);
  return Buffer.from(b64, "base64");
}

function bmp(rgb: Buffer, w: number, h: number) {
  const stride = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + stride * h;
  const out = Buffer.alloc(size);
  out.write("BM", 0);
  out.writeUInt32LE(size, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(stride * h, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * stride; // BMP rows run bottom-up
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      out[row + x * 3] = rgb[i + 2];
      out[row + x * 3 + 1] = rgb[i + 1];
      out[row + x * 3 + 2] = rgb[i];
    }
  }
  return out;
}

const view = new Bun.WebView();
await view.navigate("about:blank");
for (const [name, markup] of Object.entries(art)) {
  const size = markup.match(/width="(\d+)" height="(\d+)"/);
  if (!size) throw new Error(`${name} has no size`);
  const [w, h] = [Number(size[1]), Number(size[2])];
  await Bun.write(`${here}/${name}`, bmp(await rasterise(view, markup, w, h), w, h));
  console.log(`wrote ${name} (${w}x${h})`);
}
view.close();
