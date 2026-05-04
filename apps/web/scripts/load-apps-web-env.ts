/**
 * Load apps/web env files for tsx scripts (Next.js does this automatically for `next dev`).
 * Import this as the first side-effect import in any script that needs Supabase admin keys.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

config({ path: path.join(appRoot, ".env"), quiet: true });
config({ path: path.join(appRoot, ".env.local"), override: true, quiet: true });
