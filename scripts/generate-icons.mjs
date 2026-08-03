// Generates every raster/SVG brand asset from one geometry definition, so the
// favicon, PWA icons and Apple touch icon can never drift from the logo.
//
// The glyph must stay identical to `components/brand/logo.tsx` — that component
// is the in-app copy of the same four rects. Change one, change both.
//
// Run: node scripts/generate-icons.mjs
//
// Needs `sharp`, which ships in the tree as a Next.js image-optimization
// dependency rather than a declared devDependency of this project. If the
// import fails, `npm i -D sharp` locally to regenerate; nothing at build or
// runtime depends on it.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Brand indigo. Keep in sync with `--brand` in `app/globals.css` and the
 *  `themeColor` in `app/layout.tsx` / `theme_color` in `public/manifest.json`. */
const BRAND = "#6366f1";
const GLYPH_FG = "#ffffff";

/**
 * The mark: an "E" drawn as three ascending bars on a spine — the initial and a
 * rising bar chart at once.
 *
 * Laid out on a 24×24 grid (lucide's) inside an 18×18 box, so the padding is 3
 * on every side. Bars are 3.5 thick with 3.75 gaps (3×3.5 + 2×3.75 = 18) and
 * every end is a full pill (rx = half the thickness). The gap being a touch
 * wider than the bar is what keeps the counters open at favicon sizes.
 */
const GLYPH_VIEWBOX = 24;
const GLYPH_RECTS = [
  { x: 3, y: 3, width: 3.5, height: 18, rx: 1.75 }, // spine
  { x: 3, y: 3, width: 18, height: 3.5, rx: 1.75 }, // top bar (longest)
  { x: 3, y: 10.25, width: 14, height: 3.5, rx: 1.75 }, // middle bar
  { x: 3, y: 17.5, width: 10, height: 3.5, rx: 1.75 }, // bottom bar (shortest)
];

function glyphRects(fill) {
  return GLYPH_RECTS.map(
    (r) =>
      `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}" fill="${fill}"/>`,
  ).join("");
}

/**
 * A tile: brand square with the glyph centred on it.
 *
 * @param size      viewBox edge, in px
 * @param glyphFrac fraction of the tile edge the glyph's 24×24 box occupies
 * @param radiusFrac corner radius as a fraction of the edge; 0 = full bleed,
 *                   which is what maskable/Apple icons want since the platform
 *                   applies its own mask.
 */
function tileSvg({ size, glyphFrac = 0.72, radiusFrac = 0.234 }) {
  const box = size * glyphFrac;
  const scale = box / GLYPH_VIEWBOX;
  const offset = (size - box) / 2;
  const radius = size * radiusFrac;
  const round = (n) => Number(n.toFixed(4));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}"${radius ? ` rx="${round(radius)}"` : ""} fill="${BRAND}"/>`,
    `<g transform="translate(${round(offset)} ${round(offset)}) scale(${round(scale)})">`,
    glyphRects(GLYPH_FG),
    `</g></svg>`,
  ].join("");
}

/** The bare glyph as a standalone asset, in brand colour on transparent. */
function glyphSvg() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}" width="${GLYPH_VIEWBOX}" height="${GLYPH_VIEWBOX}">`,
    glyphRects(BRAND),
    `</svg>`,
  ].join("");
}

/**
 * Wrap a PNG in a single-image ICO container. ICO has allowed embedded PNG
 * payloads since Vista, and every browser we target reads them, so there is no
 * need to encode a BMP.
 */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

const sharp = await import("sharp")
  .then((m) => m.default)
  .catch(() => {
    console.error(
      "sharp is required to rasterize the icons. Install it with `npm i -D sharp` and re-run.",
    );
    process.exit(1);
  });

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

async function write(relPath, contents) {
  const target = join(ROOT, relPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
  console.log(`wrote ${relPath} (${contents.length} bytes)`);
}

// ── Vector ────────────────────────────────────────────────────────────────────
await write("app/icon.svg", tileSvg({ size: 32 }));
await write("public/logo.svg", tileSvg({ size: 64 }));
await write("public/logo-glyph.svg", glyphSvg());

// ── Raster ────────────────────────────────────────────────────────────────────
// Rounded tiles for `purpose: "any"`, where nothing masks the icon for us.
const rounded = tileSvg({ size: 512 });
await write("public/icons/icon-192.png", await png(rounded, 192));
await write("public/icons/icon-512.png", await png(rounded, 512));

// Full bleed with the glyph inside the inner 80% safe zone, for `maskable`
// and for iOS, both of which crop to their own shape.
const fullBleed = tileSvg({ size: 512, glyphFrac: 0.56, radiusFrac: 0 });
await write("public/icons/icon-maskable-512.png", await png(fullBleed, 512));
await write("app/apple-icon.png", await png(tileSvg({ size: 512, radiusFrac: 0 }), 180));

// Legacy `/favicon.ico`, kept alongside `app/icon.svg` for old clients.
await write("app/favicon.ico", pngToIco(await png(rounded, 32), 32));
