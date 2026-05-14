export const ADMIN_WARNING_DOMAINS = [
  "lifecycle",
  "assignment",
  "payment",
  "payout",
  "monthly_invoice",
  "recurring",
  "delete",
  "system",
] as const;

export const ADMIN_WARNING_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export const ADMIN_WARNING_ACTIONS = [
  "blocked",
  "requires_confirmation",
  "force_override_available",
  "repair_available",
  "manual_review_required",
  "diagnostic_only",
] as const;

export type AdminWarningDomain = (typeof ADMIN_WARNING_DOMAINS)[number];
export type AdminWarningSeverity = (typeof ADMIN_WARNING_SEVERITIES)[number];
export type AdminWarningAction = (typeof ADMIN_WARNING_ACTIONS)[number];

export type AdminRequiredConfirmation = {
  token: string;
  reasonRequired?: boolean;
  label?: string;
};

export type AdminWarning = {
  code: string;
  domain: AdminWarningDomain;
  severity: AdminWarningSeverity;
  action: AdminWarningAction;
  blocking: boolean;
  message: string;
  fields?: string[];
  diagnostics?: Record<string, unknown>;
  requiredConfirmation?: AdminRequiredConfirmation;
};

export type AdminWarningCompatibilityFields = {
  code?: string;
  error?: string;
  blocks?: unknown;
  indicators?: unknown;
  reason?: unknown;
  hint?: unknown;
};

export type AdminWarningPayload = AdminWarningCompatibilityFields & {
  ok: boolean;
  code?: string;
  error?: string;
  domain?: AdminWarningDomain;
  severity?: AdminWarningSeverity;
  action?: AdminWarningAction;
  blocking?: boolean;
  message?: string;
  warnings: AdminWarning[];
  requiredConfirmation?: AdminRequiredConfirmation;
  diagnostics?: Record<string, unknown>;
  fields?: string[];
};

export type BuildAdminWarningInput = {
  code: string;
  domain: AdminWarningDomain;
  severity?: AdminWarningSeverity | string | null;
  action?: AdminWarningAction | string | null;
  blocking?: boolean;
  message: string;
  fields?: string[];
  diagnostics?: Record<string, unknown>;
  requiredConfirmation?: AdminRequiredConfirmation;
};

export type BuildAdminWarningPayloadInput = AdminWarningCompatibilityFields & {
  ok?: boolean;
  warning?: BuildAdminWarningInput | AdminWarning;
  warnings?: Array<BuildAdminWarningInput | AdminWarning>;
  diagnostics?: Record<string, unknown>;
  fields?: string[];
};

function isAdminWarningSeverity(value: unknown): value is AdminWarningSeverity {
  return ADMIN_WARNING_SEVERITIES.includes(value as AdminWarningSeverity);
}

function isAdminWarningAction(value: unknown): value is AdminWarningAction {
  return ADMIN_WARNING_ACTIONS.includes(value as AdminWarningAction);
}

export function normalizeAdminWarningSeverity(value: unknown): AdminWarningSeverity {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isAdminWarningSeverity(normalized) ? normalized : "medium";
}

export function normalizeAdminWarningAction(value: unknown): AdminWarningAction {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isAdminWarningAction(normalized) ? normalized : "diagnostic_only";
}

export function buildAdminWarning(input: BuildAdminWarningInput | AdminWarning): AdminWarning {
  return {
    code: input.code,
    domain: input.domain,
    severity: normalizeAdminWarningSeverity(input.severity),
    action: normalizeAdminWarningAction(input.action),
    blocking: input.blocking ?? input.action === "blocked",
    message: input.message,
    ...(input.fields && input.fields.length > 0 ? { fields: [...input.fields] } : {}),
    ...(input.diagnostics ? { diagnostics: { ...input.diagnostics } } : {}),
    ...(input.requiredConfirmation ? { requiredConfirmation: { ...input.requiredConfirmation } } : {}),
  };
}

function firstWarning(warnings: AdminWarning[]): AdminWarning | null {
  return warnings.length > 0 ? warnings[0]! : null;
}

export function buildAdminWarningPayload(input: BuildAdminWarningPayloadInput): AdminWarningPayload {
  const warnings = [
    ...(input.warning ? [input.warning] : []),
    ...(Array.isArray(input.warnings) ? input.warnings : []),
  ].map(buildAdminWarning);
  const first = firstWarning(warnings);
  const blocking = warnings.some((w) => w.blocking);
  const requiredConfirmation = warnings.find((w) => w.requiredConfirmation)?.requiredConfirmation;
  const fields = input.fields ?? first?.fields;

  return {
    ok: input.ok ?? !blocking,
    ...(input.code ? { code: input.code } : first ? { code: first.code } : {}),
    ...(input.error ? { error: input.error } : first ? { error: first.message } : {}),
    ...(first
      ? {
          domain: first.domain,
          severity: first.severity,
          action: first.action,
          blocking,
          message: first.message,
        }
      : { blocking }),
    warnings,
    ...(requiredConfirmation ? { requiredConfirmation } : {}),
    ...(input.diagnostics ? { diagnostics: { ...input.diagnostics } } : {}),
    ...(fields && fields.length > 0 ? { fields: [...fields] } : {}),
    ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
    ...(input.indicators !== undefined ? { indicators: input.indicators } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.hint !== undefined ? { hint: input.hint } : {}),
  };
}

export function appendAdminWarningPayload(
  payload: AdminWarningPayload,
  warning: BuildAdminWarningInput | AdminWarning,
): AdminWarningPayload {
  return buildAdminWarningPayload({
    ...payload,
    warnings: [...payload.warnings, warning],
    code: payload.code,
    error: payload.error,
    blocks: payload.blocks,
    indicators: payload.indicators,
    reason: payload.reason,
    hint: payload.hint,
    diagnostics: payload.diagnostics,
    fields: payload.fields,
    ok: payload.ok,
  });
}
