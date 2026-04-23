import OpenAI from "openai";
import {
  companyProfitCents,
  marginRatio,
  resolvedRevenueCents,
} from "@/lib/admin/computeFinancialDashboard";
import type { InsightBookingRow } from "@/lib/ai/generateInsights";

/** Compact, non-PII aggregate sent to the model (never raw row dumps). */
export type AIBookingSummaryPayload = {
  currency: "ZAR";
  completedSampleSize: number;
  totals: {
    revenueZar: number;
    profitZar: number;
    avgMarginPct: number | null;
    avgServiceFeeZar: number | null;
    serviceFeeJobsCounted: number;
  };
  locationsTopByRevenue: Array<{
    name: string;
    jobs: number;
    revenueZar: number;
    profitZar: number;
    marginPct: number | null;
  }>;
  locationsTightestMargin: Array<{
    name: string;
    jobs: number;
    marginPct: number | null;
    revenueZar: number;
  }>;
  servicesByAvgProfit: Array<{
    name: string;
    jobs: number;
    avgProfitPerJobZar: number;
    marginPct: number | null;
  }>;
  leakSignal: {
    jobsUnder15MarginPct: number;
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCompleted(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "completed";
}

function locKey(b: InsightBookingRow): string {
  const t = (b.location ?? "").trim();
  return t.length > 0 ? t : "Unknown";
}

function svcKey(b: InsightBookingRow): string {
  const t = (b.service ?? "").trim();
  return t.length > 0 ? t : "Unknown";
}

function groupAgg(): Map<string, { jobs: number; revenueCents: number; profitCents: number }> {
  return new Map();
}

/**
 * Builds a bounded JSON-safe summary from completed booking rows (stored fields only).
 */
export function buildAIBookingSummaryFromRows(rows: readonly InsightBookingRow[]): AIBookingSummaryPayload {
  const completed = rows.filter((r) => isCompleted(r.status));

  let totalRevCents = 0;
  let totalProfCents = 0;
  let feeSumCents = 0;
  let feeCount = 0;
  let under15 = 0;

  const byLoc = groupAgg();
  const bySvc = groupAgg();

  for (const b of completed) {
    const rev = resolvedRevenueCents(b);
    const prof = companyProfitCents(b);
    totalRevCents += rev;
    totalProfCents += prof;

    const sf = Number(b.service_fee_cents);
    if (Number.isFinite(sf) && sf >= 0) {
      feeSumCents += sf;
      feeCount += 1;
    }

    const m = marginRatio(b);
    if (m != null && m < 0.15) under15 += 1;

    const lk = locKey(b);
    const L = byLoc.get(lk) ?? { jobs: 0, revenueCents: 0, profitCents: 0 };
    L.jobs += 1;
    L.revenueCents += rev;
    L.profitCents += prof;
    byLoc.set(lk, L);

    const sk = svcKey(b);
    const S = bySvc.get(sk) ?? { jobs: 0, revenueCents: 0, profitCents: 0 };
    S.jobs += 1;
    S.revenueCents += rev;
    S.profitCents += prof;
    bySvc.set(sk, S);
  }

  const avgMarginPct =
    totalRevCents > 0 ? round2((totalProfCents / totalRevCents) * 100) : null;
  const avgServiceFeeZar = feeCount > 0 ? round2(feeSumCents / feeCount / 100) : null;

  const locRows = [...byLoc.entries()].map(([name, v]) => ({
    name,
    jobs: v.jobs,
    revenueZar: round2(v.revenueCents / 100),
    profitZar: round2(v.profitCents / 100),
    marginPct:
      v.revenueCents > 0 ? round2((v.profitCents / v.revenueCents) * 100) : null,
  }));

  const locationsTopByRevenue = [...locRows]
    .filter((r) => r.jobs >= 3)
    .sort((a, b) => b.revenueZar - a.revenueZar)
    .slice(0, 8);

  const locationsTightestMargin = [...locRows]
    .filter((r) => r.jobs >= 3 && r.marginPct != null && r.marginPct < 15)
    .sort((a, b) => (a.marginPct ?? 99) - (b.marginPct ?? 99))
    .slice(0, 6);

  const svcRows = [...bySvc.entries()].map(([name, v]) => ({
    name,
    jobs: v.jobs,
    avgProfitPerJobZar: v.jobs > 0 ? round2(v.profitCents / v.jobs / 100) : 0,
    marginPct:
      v.revenueCents > 0 ? round2((v.profitCents / v.revenueCents) * 100) : null,
  }));

  const servicesByAvgProfit = [...svcRows]
    .filter((r) => r.jobs >= 3)
    .sort((a, b) => a.avgProfitPerJobZar - b.avgProfitPerJobZar)
    .slice(0, 6);

  return {
    currency: "ZAR",
    completedSampleSize: completed.length,
    totals: {
      revenueZar: round2(totalRevCents / 100),
      profitZar: round2(totalProfCents / 100),
      avgMarginPct,
      avgServiceFeeZar,
      serviceFeeJobsCounted: feeCount,
    },
    locationsTopByRevenue,
    locationsTightestMargin,
    servicesByAvgProfit,
    leakSignal: {
      jobsUnder15MarginPct: under15,
    },
  };
}

export type GenerateAIInsightsResult =
  | { ok: true; text: string }
  | { ok: false; skipped: string }
  | { ok: false; error: string };

const MAX_PROMPT_JSON_CHARS = 4800;

/**
 * Calls OpenAI with a **pre-summarized** payload only. Does not write to the database.
 */
export async function generateAIInsights(summary: AIBookingSummaryPayload): Promise<GenerateAIInsightsResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, skipped: "OPENAI_API_KEY is not set on the server." };
  }

  const json = JSON.stringify(summary);
  const dataBlock =
    json.length > MAX_PROMPT_JSON_CHARS ? `${json.slice(0, MAX_PROMPT_JSON_CHARS)}…` : json;

  const userPrompt = `You are a business analyst for a cleaning marketplace (South Africa, ZAR).

Analyze ONLY the JSON summary below. It is aggregated from completed jobs — no customer identifiers.

Deliver:
1) 3–5 bullet **profit insights** (margin concentration, weak pockets).
2) **Pricing** recommendations (where to raise base price or tighten discounts).
3) **Service fee** suggestions (if averages look low vs typical R30–R40 benchmarks).
4) **Locations** to optimize (call out tight-margin areas explicitly).
5) **Risks & opportunities** (one short paragraph).

Rules: stay under ~220 words; be decisive; do not invent numbers not implied by the summary; no legal promises.

Summary JSON:
${dataBlock}`;

  try {
    const openai = new OpenAI({ apiKey: key });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a data-driven business analyst for a home-services marketplace. Output concise Markdown or plain text with clear headings or bullets. Never claim you changed any data.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.55,
      max_tokens: 700,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, error: "The model returned an empty response." };
    }
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed.";
    return { ok: false, error: msg };
  }
}
