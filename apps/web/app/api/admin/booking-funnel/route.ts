import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Must match client {@link bookingRouteToFunnelStep} labels used in `booking_events.step`. */
const FUNNEL_ORDER = ["entry", "quote", "extras", "datetime", "payment"] as const;

type Row = { session_id: string; step: string; event_type: string };

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await admin
    .from("booking_events")
    .select("session_id, step, event_type, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(25_000);

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({
        since: since.toISOString(),
        rows: 0,
        message: "Run migration `20260475_booking_events.sql` — table booking_events missing.",
        dropOffByStep: [],
        viewsByStep: [],
        conversionRatePct: 0,
        topExitSteps: [],
        errorsByStep: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const sessionsAny = new Set(rows.map((r) => r.session_id));

  const viewedStepBySession = new Map<string, Set<string>>();
  const funnelStepSet = new Set<string>(FUNNEL_ORDER);
  for (const r of rows) {
    if (r.event_type !== "view") continue;
    if (!funnelStepSet.has(r.step)) continue;
    let s = viewedStepBySession.get(r.session_id);
    if (!s) {
      s = new Set();
      viewedStepBySession.set(r.session_id, s);
    }
    s.add(r.step);
  }

  const reachedPayment = new Set<string>();
  for (const r of rows) {
    if (r.step === "payment" && (r.event_type === "view" || r.event_type === "next")) {
      reachedPayment.add(r.session_id);
    }
  }

  const startedQuote = new Set<string>();
  for (const r of rows) {
    if (r.step === "quote" && r.event_type === "view") startedQuote.add(r.session_id);
  }
  const funnelStart = Math.max(startedQuote.size, 1);
  const paidOrCheckout = reachedPayment.size;
  const conversionRatePct = Math.round((paidOrCheckout / funnelStart) * 1000) / 10;

  const dropOffByStep: { step: string; viewed: number; dropped: number; dropOffPct: number }[] = [];
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const cur = FUNNEL_ORDER[i]!;
    const next = FUNNEL_ORDER[i + 1]!;
    let viewed = 0;
    let progressed = 0;
    for (const [sid, steps] of viewedStepBySession) {
      if (!steps.has(cur)) continue;
      viewed++;
      if (steps.has(next)) progressed++;
    }
    const dropped = Math.max(0, viewed - progressed);
    const dropOffPct = viewed > 0 ? Math.round((dropped / viewed) * 1000) / 10 : 0;
    dropOffByStep.push({ step: cur, viewed, dropped, dropOffPct });
  }

  const exitCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== "exit") continue;
    exitCounts.set(r.step, (exitCounts.get(r.step) ?? 0) + 1);
  }
  const topExitSteps = [...exitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([step, count]) => ({ step, count }));

  const errCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== "error") continue;
    errCounts.set(r.step, (errCounts.get(r.step) ?? 0) + 1);
  }
  const errorsByStep = [...errCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([step, count]) => ({ step, count }));

  const viewsByStep = FUNNEL_ORDER.map((step) => {
    let n = 0;
    for (const [, steps] of viewedStepBySession) {
      if (steps.has(step)) n++;
    }
    return { step, views: n };
  });

  /** Distinct sessions with ≥1 `view` on a funnel step — aligns with `viewsByStep` (unlike `sessions`, which counts any event type). */
  const sessionsWithFunnelView = viewedStepBySession.size;

  return NextResponse.json({
    since: since.toISOString(),
    rows: rows.length,
    sessions: sessionsAny.size,
    sessionsWithFunnelView,
    funnelStartSessions: funnelStart,
    reachedPaymentSessions: paidOrCheckout,
    conversionRatePct,
    dropOffByStep,
    viewsByStep,
    topExitSteps,
    errorsByStep,
  });
}
