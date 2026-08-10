import { describe, expect, it } from "vitest";
import { summarizeTransport } from "@/lib/admin/transport";

describe("transport summary", () => {
  it("separates active work, completed km and recorded cost", () => {
    expect(summarizeTransport([
      { status: "planned", total_km: null, transport_cost_entries: [] },
      { status: "in_progress", total_km: null, transport_cost_entries: [{ amount_cents: 2000 }] },
      { status: "completed", total_km: 42.5, transport_cost_entries: [{ amount_cents: 5000 }, { amount_cents: 1200 }] },
    ], 1)).toEqual({ activeRuns: 2, completedKm: 42.5, recordedCostCents: 8200, vehiclesDueForService: 1 });
  });
});

