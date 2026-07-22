import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import {
  runSeoFix001002Validation,
  type SeoFix001002Mode,
  SEO_FIX_001_002_CONFIRM_PHRASE,
} from "@/lib/gsc/seo-fix-001-002-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  confirm?: string;
  mode?: string;
};

/**
 * Authenticated Production-only SEO-FIX-001/002 GSC validation.
 *
 * Uses Vercel Production `GSC_*` in-place (never expose keys to preview/client).
 * Auth: Bearer / x-cron-secret = CRON_SECRET (same as gsc-sync).
 * Body JSON:
 *   { "confirm": "SEO-FIX-001/002-GSC-ONLY", "mode": "validate" | "inspect-only" }
 *
 * Not publicly callable without CRON_SECRET. Does not create a public GSC endpoint.
 */
async function handle(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  // Refuse non-production hosts so preview never executes with (or without) GSC writes.
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  const shaleanEnv = (process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "preview" || shaleanEnv === "preview" || shaleanEnv === "staging") {
    return NextResponse.json(
      { error: "Refusing SEO-FIX GSC validation outside Production." },
      { status: 403 },
    );
  }

  let body: Body = {};
  try {
    if (request.method !== "GET") {
      body = (await request.json()) as Body;
    }
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const confirm =
    body.confirm?.trim() ||
    url.searchParams.get("confirm")?.trim() ||
    request.headers.get("x-seo-fix-confirm")?.trim() ||
    "";
  const modeRaw =
    body.mode?.trim() || url.searchParams.get("mode")?.trim() || "validate";
  const mode: SeoFix001002Mode =
    modeRaw === "inspect-only" ? "inspect-only" : modeRaw === "validate" ? "validate" : "validate";

  if (modeRaw !== "validate" && modeRaw !== "inspect-only") {
    return NextResponse.json(
      { error: `Invalid mode=${modeRaw}. Expected validate|inspect-only.` },
      { status: 400 },
    );
  }

  if (confirm !== SEO_FIX_001_002_CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: `Refusing: confirm must be exactly ${SEO_FIX_001_002_CONFIRM_PHRASE}`,
      },
      { status: 400 },
    );
  }

  try {
    const evidence = await runSeoFix001002Validation({
      mode,
      confirmPhrase: confirm,
    });
    const status = evidence.errors.length > 0 ? 502 : 200;
    return NextResponse.json(evidence, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg.replace(/BEGIN PRIVATE KEY[\s\S]*?END PRIVATE KEY/g, "[REDACTED_KEY]") },
      { status: 500 },
    );
  }
}

/** Manual / scheduled POST with CRON_SECRET + confirm phrase. */
export async function POST(request: Request) {
  return handle(request);
}

/** Optional GET with query confirm=&mode= (still requires CRON_SECRET). */
export async function GET(request: Request) {
  return handle(request);
}
