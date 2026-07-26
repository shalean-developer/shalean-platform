/** Three-layer Office dashboard audit types. */

export type MetricStatus =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "NOT IMPLEMENTED"
  | "NOT AUTHORITATIVE"
  | "SKIPPED WITH JUSTIFICATION";

export type OfficePageSection =
  | "todays_operations"
  | "needs_action"
  | "todays_schedule"
  | "cleaner_capacity"
  | "revenue_and_receivables"
  | "summary_cards"
  | "status_strip";

export type ComparisonRule = "exact" | "absolute_tolerance" | "normalized_string";

export type MetricValueKind = "integer" | "zar_rand" | "percentage" | "string" | "boolean";

export type MetricRegistryEntry = {
  metricId: string;
  uiLabel: string;
  pageSection: OfficePageSection;
  testId: string;
  valueKind: MetricValueKind;
  uiFormattingRule: string;
  applicationSource: {
    endpoint?: string;
    responsePath?: string;
    helper?: string;
    notes: string;
  };
  databaseSource: {
    table: string;
    columns: string[];
    filters: string;
    joins: string;
    notes: string;
  };
  authoritativeCalculationId: string;
  timezone: "Africa/Johannesburg" | "UTC" | "mixed" | "n/a";
  comparisonRule: ComparisonRule;
  tolerance: number;
  toleranceJustification?: string;
  required: boolean;
  businessRuleExplanation: string;
};

export type LayerEvidence = {
  available: boolean;
  value: unknown;
  normalized: number | string | boolean | null;
  source: string;
  fetchedAt?: string;
  error?: string;
  notes?: string;
};

export type MetricAuditResult = {
  metricId: string;
  uiLabel: string;
  pageSection: OfficePageSection;
  status: MetricStatus;
  ui: LayerEvidence;
  application: LayerEvidence;
  database: LayerEvidence;
  mismatchSource?: string;
  finding?: string;
  proposedFix?: string;
};

export type OfficeAuditReport = {
  title: string;
  generatedAt: string;
  auditDateYmd: string;
  timezone: string;
  target: string;
  baseUrl: string;
  readOnly: boolean;
  decision: "GO" | "NO-GO";
  decisionText: string;
  counts: Record<MetricStatus, number>;
  metrics: MetricAuditResult[];
  schemaNotes: string[];
  privacy: {
    redactionApplied: boolean;
    prohibitedFieldsStripped: string[];
  };
  blockers: string[];
  safety: {
    officeAuditReadOnly: boolean;
    officeAuditTarget: string | null;
    writeAttemptsBlocked: number;
  };
};
