/**
 * Parallel hammer against POST /api/test/create-booking (real insert + ensureBookingAssignment).
 *
 * From `apps/web` with the dev server running:
 *   Put DISPATCH_LOAD_TEST_SECRET in `.env.local` (same as Next) — this script merges `.env.local`
 *   into `process.env` when a key is unset or empty in the shell.
 *
 * Optional env: LOAD_TEST_BASE_URL (default http://localhost:3000), TOTAL_BOOKINGS (default 80).
 *
 *   npm run simulate:dispatch
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Next loads `.env.local`; `tsx` does not — merge so the secret matches the dev server. */
function mergeEnvLocalIntoProcessEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const cur = process.env[key];
    // This key must match Next’s `.env.local`; a wrong value in the shell caused 401s.
    if (key === "DISPATCH_LOAD_TEST_SECRET" && val !== "") {
      process.env[key] = val;
    } else if (cur === undefined || cur === "") {
      process.env[key] = val;
    }
  }
}

mergeEnvLocalIntoProcessEnv();

const BASE_URL = (process.env.LOAD_TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const TOTAL = (() => {
  const n = Number(process.env.TOTAL_BOOKINGS ?? "80");
  return Number.isFinite(n) && n > 0 ? Math.min(500, Math.floor(n)) : 80;
})();

async function createBooking(i: number): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${BASE_URL}/api/test/create-booking`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-load-test-secret": SECRET,
      },
      body: JSON.stringify({ test: true, index: i }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.error("request failed", i, err);
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

async function main() {
  if (!SECRET) {
    console.error(
      "Missing DISPATCH_LOAD_TEST_SECRET. Add it to apps/web/.env.local (or export it in this shell).",
    );
    process.exit(1);
  }

  console.log(`Starting ${TOTAL} parallel requests → ${BASE_URL}/api/test/create-booking`);

  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: TOTAL }, (_, i) => createBooking(i)),
  );
  const ms = Date.now() - t0;

  let ok = 0;
  let fail = 0;
  for (const r of results) {
    if (r.ok) ok++;
    else fail++;
  }

  console.log(`Done in ${ms}ms — ok: ${ok}, failed: ${fail}`);

  const samples = results.slice(0, 5);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    console.log(`  [${i}] status=${s.status}`, JSON.stringify(s.body));
  }

  if (fail > 0) {
    if (results.every((r) => r.status === 401)) {
      console.error(
        "\nAll requests returned 401: header x-dispatch-load-test-secret does not match the server.",
        "\nFix: set DISPATCH_LOAD_TEST_SECRET the same in .env.local, restart `npm run dev`, run this from apps/web.",
        "\nShell-only values override .env.local — unset DISPATCH_LOAD_TEST_SECRET there if it is wrong.",
      );
    }
    process.exit(1);
  }
}

void main();
