import type {
  LayerEvidence,
  MetricAuditResult,
  MetricRegistryEntry,
  MetricStatus,
  OfficeAuditReport,
} from "@/lib/admin/officeAudit/types";
import { normalizeMetricValue } from "@/lib/admin/officeAudit/parseValues";
import { OFFICE_AUDIT_PROHIBITED_FIELDS } from "@/lib/admin/officeAudit/redactAudit";

function valuesMatch(
  entry: MetricRegistryEntry,
  a: number | string | boolean | null,
  b: number | string | boolean | null,
): boolean {
  if (a == null || b == null) return false;
  if (entry.comparisonRule === "normalized_string") {
    return String(a) === String(b);
  }
  if (typeof a === "number" && typeof b === "number") {
    const tol = entry.tolerance ?? 0;
    return Math.abs(a - b) <= tol;
  }
  return a === b;
}

function classifyUnavailable(entry: MetricRegistryEntry, ui: LayerEvidence, app: LayerEvidence, db: LayerEvidence): MetricStatus {
  if (!entry.required) return "SKIPPED WITH JUSTIFICATION";
  if (ui.error?.includes("NOT IMPLEMENTED") || app.error?.includes("NOT IMPLEMENTED") || db.error?.includes("NOT IMPLEMENTED")) {
    return "NOT IMPLEMENTED";
  }
  if (ui.notes?.includes("NOT AUTHORITATIVE") || app.notes?.includes("NOT AUTHORITATIVE") || db.notes?.includes("NOT AUTHORITATIVE")) {
    return "NOT AUTHORITATIVE";
  }
  return "BLOCKED";
}

export function compareMetricLayers(
  entry: MetricRegistryEntry,
  uiRaw: LayerEvidence,
  appRaw: LayerEvidence,
  dbRaw: LayerEvidence,
): MetricAuditResult {
  const ui: LayerEvidence = {
    ...uiRaw,
    normalized: uiRaw.available ? normalizeMetricValue(entry.valueKind, uiRaw.value) : null,
  };
  const application: LayerEvidence = {
    ...appRaw,
    normalized: appRaw.available ? normalizeMetricValue(entry.valueKind, appRaw.value) : null,
  };
  const database: LayerEvidence = {
    ...dbRaw,
    normalized: dbRaw.available ? normalizeMetricValue(entry.valueKind, dbRaw.value) : null,
  };

  if (!ui.available || !application.available || !database.available) {
    const status = classifyUnavailable(entry, ui, application, database);
    return {
      metricId: entry.metricId,
      uiLabel: entry.uiLabel,
      pageSection: entry.pageSection,
      status,
      ui,
      application,
      database,
      finding: `Missing layer evidence: ui=${ui.available} app=${application.available} db=${database.available}`,
      mismatchSource: "unavailable evidence",
      proposedFix:
        status === "BLOCKED"
          ? "Provide OFFICE_AUDIT_ADMIN credentials / base URL / DB access so all three layers can be captured."
          : undefined,
    };
  }

  if (
    ui.notes?.includes("NOT AUTHORITATIVE") ||
    application.notes?.includes("NOT AUTHORITATIVE") ||
    database.notes?.includes("NOT AUTHORITATIVE")
  ) {
    return {
      metricId: entry.metricId,
      uiLabel: entry.uiLabel,
      pageSection: entry.pageSection,
      status: "NOT AUTHORITATIVE",
      ui,
      application,
      database,
      finding: "At least one layer is not an authoritative source for this metric.",
      mismatchSource: "business-rule ambiguity",
      proposedFix: "Define a single authoritative SoT and expose it via a dedicated query or RPC.",
    };
  }

  const uiApp = valuesMatch(entry, ui.normalized, application.normalized);
  const appDb = valuesMatch(entry, application.normalized, database.normalized);
  const uiDb = valuesMatch(entry, ui.normalized, database.normalized);

  if (uiApp && appDb && uiDb) {
    return {
      metricId: entry.metricId,
      uiLabel: entry.uiLabel,
      pageSection: entry.pageSection,
      status: "PASS",
      ui,
      application,
      database,
    };
  }

  let mismatchSource = "business-rule ambiguity";
  let proposedFix = "Investigate aggregation rules across UI, API, and DB.";
  if (!uiApp && appDb) {
    mismatchSource = "UI rendering defect or frontend normalization defect";
    proposedFix = "Align UI formatting/parsing with the application payload path.";
  } else if (uiApp && !appDb) {
    mismatchSource = "server aggregation defect or API defect or database query defect";
    proposedFix = "Align API aggregation with the authoritative DB calculation documented in the registry.";
  } else if (!uiApp && !appDb) {
    mismatchSource = "multi-layer mismatch";
    proposedFix = "Trace the metric end-to-end; do not trust any single layer until all three agree.";
  } else if (!uiDb && uiApp) {
    mismatchSource = "stale cache or data-integrity defect";
    proposedFix = "Check cache headers / fetchedAt freshness and DB row integrity.";
  }

  return {
    metricId: entry.metricId,
    uiLabel: entry.uiLabel,
    pageSection: entry.pageSection,
    status: "FAIL",
    ui,
    application,
    database,
    mismatchSource,
    finding: `UI=${String(ui.normalized)} APP=${String(application.normalized)} DB=${String(database.normalized)}`,
    proposedFix,
  };
}

export function buildOfficeAuditDecision(metrics: MetricAuditResult[]): {
  decision: "GO" | "NO-GO";
  decisionText: string;
  counts: Record<MetricStatus, number>;
  blockers: string[];
} {
  const counts: Record<MetricStatus, number> = {
    PASS: 0,
    FAIL: 0,
    BLOCKED: 0,
    "NOT IMPLEMENTED": 0,
    "NOT AUTHORITATIVE": 0,
    "SKIPPED WITH JUSTIFICATION": 0,
  };
  for (const m of metrics) counts[m.status] += 1;

  const blockers = metrics
    .filter((m) => m.status !== "PASS")
    .map((m) => `${m.metricId}: ${m.status}${m.finding ? ` — ${m.finding}` : ""}`);

  const allPass = metrics.length > 0 && metrics.every((m) => m.status === "PASS");
  if (allPass) {
    return {
      decision: "GO",
      decisionText: "GO — OFFICE DASHBOARD VERIFIED 100% ACCURATE",
      counts,
      blockers: [],
    };
  }
  return {
    decision: "NO-GO",
    decisionText: "NO-GO — OFFICE DASHBOARD NOT YET VERIFIED 100% ACCURATE",
    counts,
    blockers,
  };
}

export function emptyLayer(source: string, error: string, notes?: string): LayerEvidence {
  return {
    available: false,
    value: null,
    normalized: null,
    source,
    error,
    notes,
  };
}

export function valueLayer(source: string, value: unknown, notes?: string, fetchedAt?: string): LayerEvidence {
  return {
    available: true,
    value,
    normalized: null,
    source,
    notes,
    fetchedAt,
  };
}

export function finalizeReport( partial: Omit<OfficeAuditReport, "decision" | "decisionText" | "counts" | "blockers" | "privacy"> & {
  metrics: MetricAuditResult[];
}): OfficeAuditReport {
  const { decision, decisionText, counts, blockers } = buildOfficeAuditDecision(partial.metrics);
  return {
    ...partial,
    decision,
    decisionText,
    counts,
    blockers,
    privacy: {
      redactionApplied: true,
      prohibitedFieldsStripped: [...OFFICE_AUDIT_PROHIBITED_FIELDS],
    },
  };
}
