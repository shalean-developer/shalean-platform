/**
 * Remove outer “canvas” pixels (reachable from image edge without crossing blue fill).
 * Keeps blue disc + interior art. Used for Shalean mark on square assets.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BLUE_FILL_DIST2 = 38 * 38;

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * @param {string} absPath absolute path to PNG/JPEG/etc. readable by sharp
 */
export async function processLogoFileInPlace(absPath) {
  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}.png`;

  const { data, info } = await sharp(absPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  if (blues.length === 0) {
    throw new Error(`No blue samples for ${absPath} (${w}x${h})`);
  }
  const blueRef = [0, 0, 0].map((_, i) => Math.round(blues.reduce((s, p) => s + p[i], 0) / blues.length));
  const blueFill = (rgb) => dist2(rgb, blueRef) <= BLUE_FILL_DIST2;

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
      if (outside[i]) {
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 0;
      } else {
        out[p + 3] = 255;
      }
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .ensureAlpha()
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toFile(tmpPath);

  try {
    fs.unlinkSync(absPath);
  } catch {
    /* ignore */
  }
  fs.renameSync(tmpPath, absPath);
}

/**
 * @param {string} webRoot apps/web root
 * @param {string[]} relPaths relative to webRoot
 */
export async function processManyInPlace(webRoot, relPaths) {
  for (const rel of relPaths) {
    const abs = path.join(webRoot, rel);
    if (!fs.existsSync(abs)) {
      console.warn("Skip (missing):", rel);
      continue;
    }
    const meta = await sharp(abs).metadata();
    console.log("Process:", rel, meta.format, `${meta.width}x${meta.height}`);
    await processLogoFileInPlace(abs);
    const after = await sharp(abs).metadata();
    console.log("  →", after.format, "hasAlpha:", after.hasAlpha, `${after.width}x${after.height}`);
  }
}
