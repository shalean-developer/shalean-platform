/**
 * One-shot: convert curated Cursor workspace PNGs → WebP under `public/images/blog/pool/`.
 *
 * Assets live outside the repo (Cursor mirror). Override dir:
 *   set CURSOR_PROJECT_ASSETS=C:\path\to\.cursor\projects\<id>\assets
 *
 * Usage (from apps/web):
 *   npx tsx scripts/import-cursor-blog-png-pool.ts
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const outDir = path.join(appRoot, "public", "images", "blog", "pool");

const DEFAULT_ASSETS_ROOT =
  process.platform === "win32"
    ? path.join(
        process.env.USERPROFILE ?? "",
        ".cursor",
        "projects",
        "c-Users-info-shalean-platform",
        "assets",
      )
    : path.join(process.env.HOME ?? "", ".cursor/projects/c-Users-info-shalean-platform/assets");

const ASSETS_ROOT = process.env.CURSOR_PROJECT_ASSETS ?? DEFAULT_ASSETS_ROOT;

const PREFIX =
  "c__Users_info_AppData_Roaming_Cursor_User_workspaceStorage_1de9d74121b913552183c3470a794fb0_images_";

/** Cursor PNG suffix (after PREFIX) → SEO WebP filename under `/images/blog/pool/`. */
const CURSOR_BLOG_IMPORT_MAP: Record<string, string> = {
  "9ce06159-9a03-4071-a1ea-328c95c65d79-78488d39-5c5a-487d-abaa-4dcd6c78cd90.png":
    "cape-town-tiles-floor-mopping.webp",
  "b94f8dee-3919-49ec-85fd-0a658d25f345-bffd3fc9-aab0-4cab-95ea-c2a696c95495.png":
    "cape-town-sage-room-professional-clean.webp",
  "bde0949d-7cef-4746-ada6-dc41eb5b7c25-eb492bb2-37b1-495f-8ece-b54a96a83aeb.png":
    "cape-town-dark-wood-floor-room.webp",
  "187e4849-4b21-4e3d-83f9-a93419ce4de3-77b7834c-c401-42f8-a848-89af7f419731.png":
    "cape-town-modern-toilet-terrazzo.webp",
  "8ec8ea50-20ff-4893-a53d-fdbb7ca2d7a6-b8a3420c-c986-450c-bd84-56bcff17da4e.png":
    "cape-town-small-office-lounge.webp",
  "0ec16257-b87b-43ce-8c71-daa309120550-bf1fa2dc-0a78-4880-af3b-cb8b55b86927.png":
    "cape-town-commercial-hallway-carpet.webp",
  "5394a879-5d1f-480b-ad2b-4946400b6a23-f579216f-c1db-477d-bd6d-cb6d51340cd5.png":
    "cape-town-busy-office-desks.webp",
  "980dc73b-af86-498e-bcb2-7711741f4334-feadb4ca-cb43-4b1b-839e-c85a848a29ee.png":
    "cape-town-bedroom-built-in-wardrobe.webp",
  "00617ab5-a20b-4fc0-8cb4-93d1e2a0134c-803e0dc5-a112-441d-8e50-7856e02a46f5.png":
    "cape-town-guest-bed-white-linens.webp",
  "45fd220b-5ebe-4445-908f-b43f2c5c5550-d747eb90-71a5-42ca-b87c-aa9a3049bea1.png":
    "cape-town-bedroom-protea-pillows.webp",
  "45fd220b-5ebe-4445-908f-b43f2c5c5550-a5a6d0eb-ddfd-4f4c-a11b-a7f875df5a65.png":
    "cape-town-bedroom-protea-runner.webp",
  "45fd220b-5ebe-4445-908f-b43f2c5c5550-f3302e81-f674-413c-8c1e-341b7e906bb3.png":
    "cape-town-bedroom-protea-luxury.webp",
  "b0f6b8af-e48e-4f9b-86e8-ef922ee1a259-9034dec0-85e6-41d9-ba1d-f16d4b5abcc8.png":
    "cape-town-carpet-extraction-bedroom.webp",
  "18a3af57-c4fb-4030-a93e-c219dbda3bde-de29a30e-48a5-476e-84ea-b09eb1b4ca9b.png":
    "cape-town-studio-kitchenette-empty.webp",
  "aea3eb82-3009-4f64-9e27-04dc9ae1bf11-7169b590-7278-4153-a16b-583b0b2ef6f1.png":
    "cape-town-living-seaview-sofas.webp",
  "959c1f9d-07e3-4dcd-b4f5-b80114ef0c43-4ef1d3ea-cdf6-4881-bbbb-8573849e099a.png":
    "cape-town-apartment-lounge-palm-view.webp",
  "571652a2-0f3e-423c-9834-cee5bf20257b-51afb429-c6f3-450e-808d-89e58fcd3a9b.png":
    "cape-town-living-room-tiled-balcony.webp",
  "5a03b3fa-1e36-4258-83d1-5e54e0537d77-04df4e9e-baf8-46d8-9751-e2257f298190.png":
    "cape-town-bathroom-shower-beige-tile.webp",
  "f78bf755-b0d3-4575-9b35-dc4369b37149-96f73173-5110-4137-8119-fbddc88310fd.png":
    "cape-town-bathroom-sink-round-mirror.webp",
  "81297eda-ed27-4204-aff6-5290c9c48998-d715c348-ba18-4586-a262-1f128bb32c97.png":
    "cape-town-bedroom-yellow-throw.webp",
  "8c77e259-6277-4f3d-929d-00564cc7efa2-6b1dd27b-91ae-42a4-87ae-6ec564c3b988.png":
    "cape-town-open-plan-floor-polish.webp",
};

function runSharp(inPath: string, outPath: string): void {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["--yes", "sharp-cli", "-i", inPath, "-o", outPath], {
    stdio: "inherit",
    cwd: appRoot,
  });
}

function main(): void {
  if (!fs.existsSync(ASSETS_ROOT)) {
    console.error("[import-cursor-blog-png-pool] Assets dir missing:", ASSETS_ROOT);
    console.error("Set CURSOR_PROJECT_ASSETS to your Cursor project assets folder.");
    process.exit(1);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let skipped = 0;
  for (const [suffix, webpName] of Object.entries(CURSOR_BLOG_IMPORT_MAP)) {
    const src = path.join(ASSETS_ROOT, `${PREFIX}${suffix}`);
    const dest = path.join(outDir, webpName);
    if (!fs.existsSync(src)) {
      console.warn("[import-cursor-blog-png-pool] Missing source:", src);
      skipped++;
      continue;
    }
    console.info("[import-cursor-blog-png-pool]", path.basename(src), "→", webpName);
    runSharp(src, dest);
    ok++;
  }

  console.info(`[import-cursor-blog-png-pool] Done: ${ok} written, ${skipped} skipped → ${outDir}`);
}

main();
