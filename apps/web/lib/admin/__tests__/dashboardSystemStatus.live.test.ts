import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/observability/recordSystemMetric", () => ({
  recordSystemMetric: vi.fn(async () => undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => undefined),
}));

import { collectOfficeOpsHealthSignals } from "@/lib/admin/collectOfficeOpsHealthSignals";
import { buildOfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { buildDashboardSystemStatusFromOfficeOps } from "@/lib/admin/dashboardSystemStatus";

function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

describe("live dashboard system status", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    loadEnv();
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  });

  it(
    "prints exact dashboard ops signals",
    async () => {
    const fetchedAt = new Date().toISOString();
    const signals = await collectOfficeOpsHealthSignals(admin, 250, fetchedAt);
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: signals.fetchedAt,
      productionHealth: signals.productionHealth,
      productionHealthError: signals.productionHealthError,
      dbLatencyMs: signals.dbLatencyMs,
      dbOk: signals.dbOk,
      systemErrorRows: signals.systemErrorRows,
      cronErrorRows: signals.cronErrorRows,
      cronSuccessRows: signals.cronSuccessRows,
      paymentDriftRows: signals.paymentDriftRows,
      notificationRows: signals.notificationRows,
      whatsappPausedUntil: signals.whatsappPausedUntil,
      customerOutboundPausedUntil: signals.customerOutboundPausedUntil,
      notificationsQueryOk: signals.notificationsQueryOk,
    });

    const cronErrorsLast24h = signals.cronErrorRows.filter((row) => {
      const t = Date.parse(row.created_at ?? "");
      return Number.isFinite(t) && t >= Date.parse(fetchedAt) - 24 * 3_600_000;
    }).length;

    const dashboard = buildDashboardSystemStatusFromOfficeOps(summary, cronErrorsLast24h);

    console.log("\n=== dashboard systemStatus ===");
    console.log(JSON.stringify(dashboard, null, 2));
    console.log("\n=== service currentStatus ===");
    for (const s of summary.services) {
      console.log(`${s.id}: ${s.currentStatus} — ${s.currentDetail ?? ""}`);
    }
    console.log("\n=== production health findings ===");
    for (const f of summary.productionHealth.findings) {
      console.log(`[${f.severity}] ${f.code} x${f.count}`);
    }
    console.log("\nallOperationalNow:", summary.allOperationalNow);

    expect(dashboard).toBeTruthy();
    },
    60_000,
  );
});
