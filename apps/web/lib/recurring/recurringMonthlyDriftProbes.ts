export type RecurringMonthlyDriftSeverity = "critical" | "high" | "medium" | "low" | "info";

export type RecurringMonthlyDriftRepairability =
  | "auto_repair_candidate"
  | "data_backfill_candidate"
  | "template_review_required"
  | "manual_review_required"
  | "not_repairable";

export type RecurringMonthlyDriftCode =
  | "invoice_paid_child_unsettled"
  | "recurring_child_missing_payout_frozen_cents"
  | "recurring_child_missing_display_earnings_cents"
  | "recurring_child_missing_duration_minutes"
  | "recurring_child_extras_parity_mismatch"
  | "recurring_stale_pricing_drift"
  | "recurring_stale_duration_drift"
  | "recurring_payout_eligibility_drift";

export type RecurringMonthlyDriftFinding = {
  code: RecurringMonthlyDriftCode;
  severity: RecurringMonthlyDriftSeverity;
  repairability: RecurringMonthlyDriftRepairability;
  bookingId?: string;
  recurringId?: string | null;
  monthlyInvoiceId?: string | null;
  message: string;
  fallbackUsage: {
    used: boolean;
    sources: string[];
  };
  diagnostics: Record<string, unknown>;
};

export type RecurringMonthlyDriftBookingRow = {
  id?: string | null;
  recurring_id?: string | null;
  is_recurring_generated?: boolean | null;
  is_monthly_billing_booking?: boolean | null;
  billing_type?: string | null;
  monthly_invoice_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | null;
  display_earnings_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  duration_minutes?: number | null;
  extras?: unknown;
  booking_snapshot?: unknown;
  price_snapshot?: unknown;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
};

export type RecurringMonthlyDriftInvoiceRow = {
  id?: string | null;
  status?: string | null;
};

export type RecurringMonthlyDriftTemplateRow = {
  id?: string | null;
  price?: number | null;
  booking_snapshot_template?: unknown;
};

export type RecurringMonthlyDriftInput = {
  booking: RecurringMonthlyDriftBookingRow;
  invoice?: RecurringMonthlyDriftInvoiceRow | null;
  recurringTemplate?: RecurringMonthlyDriftTemplateRow | null;
  expectedCanonicalDurationMinutes?: number | null;
  expectedCanonicalPriceCents?: number | null;
  priceToleranceCents?: number;
  durationToleranceMinutes?: number;
};

export type RecurringGenerationParityDiagnostics = {
  bookingId?: string;
  recurringId?: string | null;
  isRecurringChild: boolean;
  isMonthlyRecurringChild: boolean;
  invoiceStatus: string | null;
  childPaymentStatus: string | null;
  childPayoutStatus: string | null;
  amountSource: "amount_paid_cents" | "total_paid_zar" | "none";
  childPriceCents: number | null;
  snapshotPriceCents: number | null;
  templatePriceCents: number | null;
  persistedDurationMinutes: number | null;
  snapshotDurationMinutes: number | null;
  templateDurationMinutes: number | null;
  canonicalDurationMinutes: number | null;
  rowExtrasCount: number;
  snapshotExtrasCount: number;
  templateExtrasCount: number;
  fallbackUsage: {
    used: boolean;
    sources: string[];
  };
  parity: {
    priceMatchesSnapshot: boolean | null;
    priceMatchesTemplate: boolean | null;
    durationMatchesSnapshot: boolean | null;
    durationMatchesTemplate: boolean | null;
    durationMatchesCanonical: boolean | null;
    extrasMatchSnapshot: boolean | null;
  };
};

const DEFAULT_PRICE_TOLERANCE_CENTS = 100;
const DEFAULT_DURATION_TOLERANCE_MINUTES = 15;
const MIN_REASONABLE_DURATION_MINUTES = 30;

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function centsFromZar(v: unknown): number | null {
  const n = finiteNumber(v);
  return n == null ? null : Math.round(n * 100);
}

function centsFromCents(v: unknown): number | null {
  const n = finiteNumber(v);
  return n == null ? null : Math.round(n);
}

function positiveCents(v: unknown): number | null {
  const n = centsFromCents(v);
  return n != null && n > 0 ? n : null;
}

function validDurationMinutes(v: unknown): number | null {
  const n = finiteNumber(v);
  if (n == null || n < MIN_REASONABLE_DURATION_MINUTES) return null;
  return Math.round(n);
}

function snapshotLocked(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  return isRecord(snapshot.locked) ? snapshot.locked : null;
}

function lockedDurationMinutes(locked: Record<string, unknown> | null): number | null {
  if (!locked) return null;
  const hours = finiteNumber(locked.duration) ?? finiteNumber(locked.finalHours);
  if (hours == null || hours <= 0) return null;
  return Math.max(MIN_REASONABLE_DURATION_MINUTES, Math.round(hours * 60));
}

function lockedPriceCents(locked: Record<string, unknown> | null): number | null {
  if (!locked) return null;
  return centsFromZar(locked.price) ?? centsFromZar(locked.finalPrice);
}

function rowPriceCents(row: RecurringMonthlyDriftBookingRow): {
  cents: number | null;
  source: RecurringGenerationParityDiagnostics["amountSource"];
} {
  const amountPaid = centsFromCents(row.amount_paid_cents);
  if (amountPaid != null && amountPaid > 0) return { cents: amountPaid, source: "amount_paid_cents" };
  const totalPaid = centsFromZar(row.total_paid_zar);
  if (totalPaid != null) return { cents: totalPaid, source: "total_paid_zar" };
  return { cents: null, source: "none" };
}

type NormalizedExtra = { slug: string; price: number | null };

function normalizeExtras(raw: unknown): NormalizedExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedExtra[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let slug = "";
    let price: number | null = null;
    if (typeof item === "string") {
      slug = item.trim();
    } else if (isRecord(item)) {
      slug = typeof item.slug === "string" ? item.slug.trim() : "";
      price = centsFromZar(item.price);
    }
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, price });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function extrasFromLocked(locked: Record<string, unknown> | null): NormalizedExtra[] {
  if (!locked) return [];
  const lineItems = normalizeExtras(locked.extras_line_items);
  return lineItems.length > 0 ? lineItems : normalizeExtras(locked.extras);
}

function extrasEqual(a: readonly NormalizedExtra[], b: readonly NormalizedExtra[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (!y || x.slug !== y.slug) return false;
    return x.price == null || y.price == null || x.price === y.price;
  });
}

function differs(a: number | null, b: number | null, tolerance: number): boolean {
  return a != null && b != null && Math.abs(a - b) > tolerance;
}

function hasRecurringIdentity(row: RecurringMonthlyDriftBookingRow): boolean {
  return (
    row.is_recurring_generated === true ||
    Boolean(row.recurring_id) ||
    norm(row.billing_type) === "recurring_invoice" ||
    row.is_monthly_billing_booking === true
  );
}

function isMonthlyRecurring(row: RecurringMonthlyDriftBookingRow): boolean {
  return row.is_monthly_billing_booking === true || norm(row.billing_type) === "recurring_invoice";
}

function isTerminalIgnoredStatus(row: RecurringMonthlyDriftBookingRow): boolean {
  const s = norm(row.status);
  return s === "cancelled" || s === "payment_expired";
}

function hasCleanerContext(row: RecurringMonthlyDriftBookingRow): boolean {
  return Boolean(row.cleaner_id || row.selected_cleaner_id || row.team_id || row.is_team_job === true);
}

function addFinding(
  findings: RecurringMonthlyDriftFinding[],
  row: RecurringMonthlyDriftBookingRow,
  code: RecurringMonthlyDriftCode,
  severity: RecurringMonthlyDriftSeverity,
  repairability: RecurringMonthlyDriftRepairability,
  message: string,
  diagnostics: Record<string, unknown>,
  fallbackSources: string[] = [],
): void {
  findings.push({
    code,
    severity,
    repairability,
    bookingId: row.id ?? undefined,
    recurringId: row.recurring_id ?? null,
    monthlyInvoiceId: row.monthly_invoice_id ?? null,
    message,
    fallbackUsage: { used: fallbackSources.length > 0, sources: fallbackSources },
    diagnostics,
  });
}

export function buildRecurringGenerationParityDiagnostics(
  input: RecurringMonthlyDriftInput,
): RecurringGenerationParityDiagnostics {
  const row = input.booking;
  const invoiceStatus = input.invoice ? norm(input.invoice.status) || null : null;
  const childLocked = snapshotLocked(row.booking_snapshot);
  const templateLocked = snapshotLocked(input.recurringTemplate?.booking_snapshot_template);
  const childPrice = rowPriceCents(row);
  const snapshotPrice = lockedPriceCents(childLocked);
  const templatePrice = centsFromZar(input.recurringTemplate?.price) ?? lockedPriceCents(templateLocked);
  const persistedDuration = validDurationMinutes(row.duration_minutes);
  const snapshotDuration = lockedDurationMinutes(childLocked);
  const templateDuration = lockedDurationMinutes(templateLocked);
  const canonicalDuration = validDurationMinutes(input.expectedCanonicalDurationMinutes);
  const rowExtras = normalizeExtras(row.extras);
  const snapshotExtras = extrasFromLocked(childLocked);
  const templateExtras = extrasFromLocked(templateLocked);
  const fallbackSources: string[] = [];

  if (childPrice.source === "total_paid_zar") fallbackSources.push("price_total_paid_zar");
  if (childPrice.source === "none") fallbackSources.push("price_missing");
  if (persistedDuration == null) fallbackSources.push("duration_missing");
  if (rowExtras.length === 0 && snapshotExtras.length > 0) fallbackSources.push("row_extras_empty_snapshot_used_for_probe");
  if (snapshotPrice == null && templatePrice != null) fallbackSources.push("snapshot_price_missing_template_probe");
  if (snapshotDuration == null && templateDuration != null) fallbackSources.push("snapshot_duration_missing_template_probe");

  const priceTolerance = input.priceToleranceCents ?? DEFAULT_PRICE_TOLERANCE_CENTS;
  const durationTolerance = input.durationToleranceMinutes ?? DEFAULT_DURATION_TOLERANCE_MINUTES;

  return {
    bookingId: row.id ?? undefined,
    recurringId: row.recurring_id ?? null,
    isRecurringChild: hasRecurringIdentity(row),
    isMonthlyRecurringChild: isMonthlyRecurring(row),
    invoiceStatus,
    childPaymentStatus: norm(row.payment_status) || null,
    childPayoutStatus: norm(row.payout_status) || null,
    amountSource: childPrice.source,
    childPriceCents: childPrice.cents,
    snapshotPriceCents: snapshotPrice,
    templatePriceCents: templatePrice,
    persistedDurationMinutes: persistedDuration,
    snapshotDurationMinutes: snapshotDuration,
    templateDurationMinutes: templateDuration,
    canonicalDurationMinutes: canonicalDuration,
    rowExtrasCount: rowExtras.length,
    snapshotExtrasCount: snapshotExtras.length,
    templateExtrasCount: templateExtras.length,
    fallbackUsage: { used: fallbackSources.length > 0, sources: fallbackSources },
    parity: {
      priceMatchesSnapshot:
        childPrice.cents == null || snapshotPrice == null ? null : !differs(childPrice.cents, snapshotPrice, priceTolerance),
      priceMatchesTemplate:
        childPrice.cents == null || templatePrice == null ? null : !differs(childPrice.cents, templatePrice, priceTolerance),
      durationMatchesSnapshot:
        persistedDuration == null || snapshotDuration == null
          ? null
          : !differs(persistedDuration, snapshotDuration, durationTolerance),
      durationMatchesTemplate:
        persistedDuration == null || templateDuration == null
          ? null
          : !differs(persistedDuration, templateDuration, durationTolerance),
      durationMatchesCanonical:
        persistedDuration == null || canonicalDuration == null
          ? null
          : !differs(persistedDuration, canonicalDuration, durationTolerance),
      extrasMatchSnapshot: snapshotExtras.length === 0 && rowExtras.length === 0 ? null : extrasEqual(rowExtras, snapshotExtras),
    },
  };
}

export function detectRecurringMonthlyDrift(input: RecurringMonthlyDriftInput): RecurringMonthlyDriftFinding[] {
  const row = input.booking;
  if (!hasRecurringIdentity(row) || isTerminalIgnoredStatus(row)) return [];

  const findings: RecurringMonthlyDriftFinding[] = [];
  const diagnostics = buildRecurringGenerationParityDiagnostics(input);
  const invoicePaid = diagnostics.invoiceStatus === "paid";
  const paymentSuccess = diagnostics.childPaymentStatus === "success";
  const payoutEligible = diagnostics.childPayoutStatus === "eligible";
  const frozenCents = positiveCents(row.payout_frozen_cents);
  const displayCents = positiveCents(row.display_earnings_cents);
  const cleanerPayoutCents = positiveCents(row.cleaner_payout_cents);
  const completed = norm(row.status) === "completed";

  if (isMonthlyRecurring(row) && invoicePaid && (!paymentSuccess || !payoutEligible || frozenCents == null)) {
    addFinding(
      findings,
      row,
      "invoice_paid_child_unsettled",
      "critical",
      "auto_repair_candidate",
      "Paid monthly invoice has a recurring child that is not fully settled.",
      {
        invoiceStatus: diagnostics.invoiceStatus,
        paymentStatus: diagnostics.childPaymentStatus,
        payoutStatus: diagnostics.childPayoutStatus,
        payoutFrozenCents: frozenCents,
      },
    );
  }

  if (isMonthlyRecurring(row) && invoicePaid && paymentSuccess && frozenCents == null) {
    addFinding(
      findings,
      row,
      "recurring_child_missing_payout_frozen_cents",
      "high",
      "data_backfill_candidate",
      "Recurring monthly child is paid but missing frozen payout cents.",
      { invoiceStatus: diagnostics.invoiceStatus, paymentStatus: diagnostics.childPaymentStatus },
      displayCents == null && cleanerPayoutCents != null ? ["cleaner_payout_cents"] : [],
    );
  }

  if ((completed || hasCleanerContext(row)) && displayCents == null) {
    addFinding(
      findings,
      row,
      "recurring_child_missing_display_earnings_cents",
      completed ? "high" : "medium",
      "data_backfill_candidate",
      "Recurring child has cleaner context but is missing display earnings.",
      { status: norm(row.status), cleanerContext: hasCleanerContext(row), cleanerPayoutCents },
      cleanerPayoutCents != null ? ["cleaner_payout_cents"] : [],
    );
  }

  if (diagnostics.persistedDurationMinutes == null) {
    addFinding(
      findings,
      row,
      "recurring_child_missing_duration_minutes",
      "medium",
      "data_backfill_candidate",
      "Recurring child is missing a valid persisted duration_minutes value.",
      { rawDurationMinutes: row.duration_minutes, snapshotDurationMinutes: diagnostics.snapshotDurationMinutes },
      diagnostics.snapshotDurationMinutes != null ? ["booking_snapshot.locked.duration"] : [],
    );
  }

  if (diagnostics.parity.extrasMatchSnapshot === false) {
    addFinding(
      findings,
      row,
      "recurring_child_extras_parity_mismatch",
      "high",
      "template_review_required",
      "Recurring child row extras differ from the locked booking snapshot extras.",
      {
        rowExtrasCount: diagnostics.rowExtrasCount,
        snapshotExtrasCount: diagnostics.snapshotExtrasCount,
        templateExtrasCount: diagnostics.templateExtrasCount,
      },
      diagnostics.rowExtrasCount === 0 && diagnostics.snapshotExtrasCount > 0
        ? ["booking_snapshot.locked.extras_line_items"]
        : [],
    );
  }

  if (
    diagnostics.parity.priceMatchesSnapshot === false ||
    diagnostics.parity.priceMatchesTemplate === false ||
    differs(diagnostics.childPriceCents, input.expectedCanonicalPriceCents ?? null, input.priceToleranceCents ?? DEFAULT_PRICE_TOLERANCE_CENTS)
  ) {
    addFinding(
      findings,
      row,
      "recurring_stale_pricing_drift",
      "high",
      "template_review_required",
      "Recurring child price differs from snapshot, template, or supplied canonical price.",
      {
        childPriceCents: diagnostics.childPriceCents,
        snapshotPriceCents: diagnostics.snapshotPriceCents,
        templatePriceCents: diagnostics.templatePriceCents,
        expectedCanonicalPriceCents: input.expectedCanonicalPriceCents ?? null,
        priceToleranceCents: input.priceToleranceCents ?? DEFAULT_PRICE_TOLERANCE_CENTS,
      },
    );
  }

  if (
    diagnostics.parity.durationMatchesSnapshot === false ||
    diagnostics.parity.durationMatchesTemplate === false ||
    diagnostics.parity.durationMatchesCanonical === false
  ) {
    addFinding(
      findings,
      row,
      "recurring_stale_duration_drift",
      "medium",
      "template_review_required",
      "Recurring child duration differs from snapshot, template, or supplied canonical duration.",
      {
        persistedDurationMinutes: diagnostics.persistedDurationMinutes,
        snapshotDurationMinutes: diagnostics.snapshotDurationMinutes,
        templateDurationMinutes: diagnostics.templateDurationMinutes,
        canonicalDurationMinutes: diagnostics.canonicalDurationMinutes,
        durationToleranceMinutes: input.durationToleranceMinutes ?? DEFAULT_DURATION_TOLERANCE_MINUTES,
      },
    );
  }

  if (
    (payoutEligible && (!invoicePaid || !paymentSuccess)) ||
    (completed && invoicePaid && paymentSuccess && cleanerPayoutCents != null && !payoutEligible)
  ) {
    addFinding(
      findings,
      row,
      "recurring_payout_eligibility_drift",
      "high",
      "manual_review_required",
      "Recurring payout eligibility does not match invoice/payment settlement state.",
      {
        completed,
        invoiceStatus: diagnostics.invoiceStatus,
        paymentStatus: diagnostics.childPaymentStatus,
        payoutStatus: diagnostics.childPayoutStatus,
        cleanerPayoutCents,
      },
    );
  }

  return findings;
}

export function detectRecurringMonthlyDriftForRows(
  rows: readonly RecurringMonthlyDriftBookingRow[],
  options?: {
    invoicesById?: Map<string, RecurringMonthlyDriftInvoiceRow>;
    recurringTemplatesById?: Map<string, RecurringMonthlyDriftTemplateRow>;
    expectedCanonicalDurationMinutesByBookingId?: Map<string, number>;
    expectedCanonicalPriceCentsByBookingId?: Map<string, number>;
  },
): RecurringMonthlyDriftFinding[] {
  const findings: RecurringMonthlyDriftFinding[] = [];
  for (const booking of rows) {
    const invoiceId = String(booking.monthly_invoice_id ?? "");
    const recurringId = String(booking.recurring_id ?? "");
    const bookingId = String(booking.id ?? "");
    findings.push(
      ...detectRecurringMonthlyDrift({
        booking,
        invoice: invoiceId ? options?.invoicesById?.get(invoiceId) ?? null : null,
        recurringTemplate: recurringId ? options?.recurringTemplatesById?.get(recurringId) ?? null : null,
        expectedCanonicalDurationMinutes: bookingId
          ? options?.expectedCanonicalDurationMinutesByBookingId?.get(bookingId) ?? null
          : null,
        expectedCanonicalPriceCents: bookingId
          ? options?.expectedCanonicalPriceCentsByBookingId?.get(bookingId) ?? null
          : null,
      }),
    );
  }
  return findings;
}
