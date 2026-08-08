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

// ── iOS launch screens ────────────────────────────────────────────────────────
// iOS does NOT derive a splash from the manifest the way Android does: without
// `apple-touch-startup-image` an installed PWA shows a blank white screen while
// the first page loads. Each entry needs an exact-resolution image plus a media
// query naming the device, which is why this is a list rather than one file.
//
// Portrait only — the manifest pins `orientation: portrait-primary`, so the
// landscape half of the matrix would never be used.
//
// The wordless mark on a brand field: a launch screen is glanced at, not read,
// and it must match the icon the user just tapped.
const LAUNCH_SCREENS = [
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 }, // iPhone 16 Pro Max
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 }, // iPhone 16 Pro
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 }, // 14/15 Pro Max, 16 Plus
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 }, // 14/15 Pro, 16
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 }, // 12/13 Pro Max
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 }, // 12/13/14
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 }, // X, XS, 11 Pro
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 }, // XR, 11
  { w: 1242, h: 2208, dw: 414, dh: 736, dpr: 3 }, // 6+/7+/8+
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 }, // 6/7/8, SE 2/3
  { w: 1080, h: 2340, dw: 360, dh: 780, dpr: 3 }, // 12/13 mini
  { w: 640, h: 1136, dw: 320, dh: 568, dpr: 2 }, // SE 1st gen
  { w: 2048, h: 2732, dw: 1024, dh: 1366, dpr: 2 }, // iPad Pro 12.9"
  { w: 1668, h: 2388, dw: 834, dh: 1194, dpr: 2 }, // iPad Pro 11"
  { w: 1668, h: 2224, dw: 834, dh: 1112, dpr: 2 }, // iPad Air 10.5"
  { w: 1536, h: 2048, dw: 768, dh: 1024, dpr: 2 }, // iPad 9.7"
];

/** Brand field with the glyph centred, sized as a fraction of the short edge. */
function launchSvg(width, height, glyphFrac = 0.28) {
  const box = Math.min(width, height) * glyphFrac;
  const scale = box / GLYPH_VIEWBOX;
  const x = (width - box) / 2;
  const y = (height - box) / 2;
  const round = (n) => Number(n.toFixed(4));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="${BRAND}"/>`,
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">`,
    glyphRects(GLYPH_FG),
    `</g></svg>`,
  ].join("");
}

for (const s of LAUNCH_SCREENS) {
  const buffer = await sharp(Buffer.from(launchSvg(s.w, s.h)))
    .resize(s.w, s.h)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await write(`public/splash/launch-${s.w}x${s.h}.png`, buffer);
}

// The <link> media queries that pair each image with its device. Printed so the
// list in app/layout.tsx can be regenerated rather than hand-maintained.
console.log("\n// startupImage entries for app/layout.tsx:");
for (const s of LAUNCH_SCREENS) {
  console.log(
    `  { url: "/splash/launch-${s.w}x${s.h}.png", media: "(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)" },`,
  );
}
