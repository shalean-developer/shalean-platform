/**
 * Strip outer white/non-blue padding from existing favicon PNGs (edge flood, same as main logo).
 * Rebuilds `.ico` from those PNGs (sharp cannot write ICO).
 *
 * For **sharp** tab icons after this pass, run `generate-favicons-from-logo.mjs` so every size is
 * resampled from `public/images/shalean-logo.png` (avoids tiny 32×32 `app/icon.png` looking blurry).
 *
 * Run from apps/web: node scripts/process-favicons-transparent.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import toIco from "to-ico";
import { processManyInPlace } from "./lib/shaleanLogoOutsideTransparency.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const PNG_RELATIVE = [
  "app/icon.png",
  "app/apple-icon.png",
  "public/favicon-16x16.png",
  "public/favicon-32x32.png",
  "public/favicon-48x48.png",
  "public/favicon-64x64.png",
  "public/favicon-128x128.png",
  "public/favicon-256x256.png",
  "public/android-chrome-192x192.png",
  "public/android-chrome-512x512.png",
];

async function writeIcoFromPngs(outAbs, sizes) {
  const buffers = sizes.map((rel) => {
    const p = path.join(webRoot, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing for ICO: ${rel}`);
    return fs.readFileSync(p);
  });
  const ico = await toIco(buffers);
  fs.writeFileSync(outAbs, ico);
  console.log("Wrote ICO:", outAbs, "layers:", sizes.join(", "));
}

async function main() {
  await processManyInPlace(webRoot, PNG_RELATIVE);

  await writeIcoFromPngs(path.join(webRoot, "app", "favicon.ico"), [
    "public/favicon-16x16.png",
    "public/favicon-32x32.png",
    "public/favicon-48x48.png",
  ]);
  await writeIcoFromPngs(path.join(webRoot, "public", "favicon.ico"), [
    "public/favicon-16x16.png",
    "public/favicon-32x32.png",
    "public/favicon-48x48.png",
  ]);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
