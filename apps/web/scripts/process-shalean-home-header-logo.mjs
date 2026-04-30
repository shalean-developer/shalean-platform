/**
 * PNG → RGBA: outer non-blue (background + dark ring) via edge flood; white (≥240) → transparent;
 * interior non-blue (e.g. hand/droplets) → transparent; blue fill keeps original RGB unchanged.
 * No flatten(), no blur. Run from apps/web: node scripts/process-shalean-home-header-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

/** RGB ≥ this counts as white → alpha 0 */
const WHITE_MIN = 240;

/** Squared distance threshold: pixel is “blue fill” if ≤ this (original RGB kept, not rewritten). */
const BLUE_FILL_DIST2 = 38 * 38;

const INPUT_CANDIDATES = [
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_download-9861377e-d0a4-4fec-a4b6-6d828b625959.png",
  ),
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_70984c38-5099-4f4f-95cb-0e15cf39e235-cd0868b1-3784-4bdd-8773-ac5aed76538a.png",
  ),
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_3757b3fe-f84a-413d-b844-8a0d07372957-ffb3e2fc-8210-4b72-96ff-0c151f76acca.png",
  ),
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_shalean-logo-home-header-faee2f8d-949d-4dbb-ab88-7112dfd67466.png",
  ),
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_image-6fb13c19-959d-4ba9-80f8-5cf63b064719.png",
  ),
  path.join(
    "C:",
    "Users",
    "info",
    ".cursor",
    "projects",
    "c-Users-info-shalean-platform",
    "assets",
    "c__Users_info_shalean-platform_apps_web_public_images_shalean-logo-home-header.png",
  ),
  path.join(webRoot, "public", "images", "shalean-logo-home-header.png"),
];

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function isWhite(rgb) {
  return rgb[0] >= WHITE_MIN && rgb[1] >= WHITE_MIN && rgb[2] >= WHITE_MIN;
}

async function main() {
  const inputPath = INPUT_CANDIDATES.find((p) => fs.existsSync(p));
  if (!inputPath) {
    console.error("No input file found in candidates.");
    process.exit(1);
  }
  console.log("Input:", inputPath);
  const inMeta = await sharp(inputPath).metadata();
  console.log("Input hasAlpha:", inMeta.hasAlpha, "channels:", inMeta.channels);

  const outPath = path.join(webRoot, "public", "images", "shalean-logo-home-header.png");

  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  if (info.channels !== 4) throw new Error("Expected RGBA after ensureAlpha");

  const idx = (x, y) => (y * w + x) * 4;
  const getRgb = (x, y) => [data[idx(x, y)], data[idx(x, y) + 1], data[idx(x, y) + 2]];

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rMax = Math.min(w, h) * 0.48;
  const blues = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r < rMax * 0.22 || r > rMax * 0.92) continue;
      const rgb = getRgb(x, y);
      const [r0, g0, b0] = rgb;
      if (b0 > r0 + 15 && b0 > g0 + 10 && b0 > 90) blues.push(rgb);
    }
  }
  if (blues.length < 20) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rgb = getRgb(x, y);
        const [r0, g0, b0] = rgb;
        if (b0 > r0 && b0 > g0 && b0 > 80) blues.push(rgb);
      }
    }
  }
  const blueRef = [0, 0, 0].map((_, i) => Math.round(blues.reduce((s, p) => s + p[i], 0) / blues.length));

  const blueFill = (rgb) => dist2(rgb, blueRef) <= BLUE_FILL_DIST2;

  /** Edge flood through non–blue-fill pixels: background + outer dark ring (not crossing blue). */
  const outside = new Uint8Array(w * h);
  const q = [];
  const tryEdge = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i]) return;
    const rgb = getRgb(x, y);
    if (blueFill(rgb)) return;
    outside[i] = 1;
    q.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    tryEdge(x, 0);
    tryEdge(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryEdge(0, y);
    tryEdge(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (outside[i]) continue;
      const rgb = getRgb(nx, ny);
      if (blueFill(rgb)) continue;
      outside[i] = 1;
      q.push([nx, ny]);
    }
  }

  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = idx(x, y);
      const rgb = [out[p], out[p + 1], out[p + 2]];

      if (isWhite(rgb)) {
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 0;
        continue;
      }
      if (outside[i]) {
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 0;
        continue;
      }
      // Enclosed by blue ring but not blue (e.g. hand/droplets on blue): cut out
      if (!blueFill(rgb)) {
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 0;
        continue;
      }
      out[p + 3] = 255;
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .ensureAlpha()
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toFile(outPath);

  const outMeta = await sharp(outPath).metadata();
  console.log("Wrote:", outPath);
  console.log("Output channels:", outMeta.channels, "hasAlpha:", outMeta.hasAlpha, "size:", `${outMeta.width}x${outMeta.height}`);
  console.log("Blue reference (classification only, unchanged on pixels kept):", blueRef.join(","));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
