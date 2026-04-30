/**
 * `public/images/shalean-logo.png` — outer white via edge flood (see lib).
 * Run from apps/web: node scripts/process-shalean-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { processLogoFileInPlace } from "./lib/shaleanLogoOutsideTransparency.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const inPath = path.join(webRoot, "public", "images", "shalean-logo.png");

async function main() {
  if (!fs.existsSync(inPath)) {
    console.error("Missing:", inPath);
    process.exit(1);
  }
  console.log("Input:", inPath);
  await processLogoFileInPlace(inPath);
  const outMeta = await sharp(inPath).metadata();
  console.log("Wrote:", inPath);
  console.log("Output format:", outMeta.format, "channels:", outMeta.channels, "hasAlpha:", outMeta.hasAlpha, "size:", `${outMeta.width}x${outMeta.height}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
