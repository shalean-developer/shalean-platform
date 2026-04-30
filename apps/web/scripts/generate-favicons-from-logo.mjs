/**
 * Build all favicons / PWA icons from the high-res transparent master
 * `public/images/shalean-logo.png` (Lanczos resize). Fixes blurry tabs when `app/icon.png`
 * was only 32×32 — Next uses `icon.png` for the tab; 512px gives a sharp source.
 *
 * Run from apps/web: node scripts/generate-favicons-from-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const MASTER = path.join(webRoot, "public", "images", "shalean-logo.png");

/** [relativePath, edgePx] — `app/icon.png` is large for HiDPI browser chrome */
const OUTPUTS = [
  ["app/icon.png", 512],
  ["app/apple-icon.png", 180],
  ["public/favicon-16x16.png", 16],
  ["public/favicon-32x32.png", 32],
  ["public/favicon-48x48.png", 48],
  ["public/favicon-64x64.png", 64],
  ["public/favicon-128x128.png", 128],
  ["public/favicon-256x256.png", 256],
  ["public/android-chrome-192x192.png", 192],
  ["public/android-chrome-512x512.png", 512],
];

const ICO_LAYER_RELS = [
  "public/favicon-16x16.png",
  "public/favicon-32x32.png",
  "public/favicon-48x48.png",
  "public/favicon-64x64.png",
  "public/favicon-128x128.png",
];

async function writePngSquare(outAbs, edge) {
  await sharp(MASTER)
    .resize(edge, edge, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toFile(outAbs);
}

async function writeIcoFromPngs(outAbs, rels) {
  const buffers = rels.map((rel) => {
    const p = path.join(webRoot, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing for ICO: ${rel}`);
    return fs.readFileSync(p);
  });
  fs.writeFileSync(outAbs, await toIco(buffers));
  console.log("ICO:", outAbs, "←", rels.join(", "));
}

async function main() {
  if (!fs.existsSync(MASTER)) {
    console.error("Missing master:", MASTER);
    process.exit(1);
  }
  const m = await sharp(MASTER).metadata();
  console.log("Master:", MASTER, m.width, "×", m.height, "alpha:", m.hasAlpha);

  for (const [rel, px] of OUTPUTS) {
    const out = path.join(webRoot, rel);
    await writePngSquare(out, px);
    const a = await sharp(out).metadata();
    console.log("Wrote", rel, "→", a.width, "×", a.height);
  }

  await writeIcoFromPngs(path.join(webRoot, "app", "favicon.ico"), ICO_LAYER_RELS);
  await writeIcoFromPngs(path.join(webRoot, "public", "favicon.ico"), ICO_LAYER_RELS);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
