export type TransportRunSummaryInput = {
  status: string;
  total_km: number | null;
  transport_cost_entries?: Array<{ amount_cents: number }> | null;
};

export function summarizeTransport(runs: readonly TransportRunSummaryInput[], vehiclesDueForService: number) {
  return {
    activeRuns: runs.filter((run) => run.status === "planned" || run.status === "in_progress").length,
    completedKm: runs.reduce((sum, run) => sum + (run.status === "completed" ? Number(run.total_km ?? 0) : 0), 0),
    recordedCostCents: runs.reduce((sum, run) => sum + (run.transport_cost_entries ?? []).reduce((inner, entry) => inner + entry.amount_cents, 0), 0),
    vehiclesDueForService,
  };
}

