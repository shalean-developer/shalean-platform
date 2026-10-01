export type MonthlyInvoicePaymentSource =
  | "paystack"
  | "manual_eft"
  | "cleaning_credit"
  | "zero_value"
  | "mixed"
  | "unknown"
  | "unpaid";

export type MonthlyInvoicePaymentEvidence = {
  status?: string | null;
  totalAmountCents?: number | null;
  amountPaidCents?: number | null;
  closureReason?: string | null;
  eventKinds?: string[];
  hasPaystackLedger?: boolean;
  hasCleaningCreditEvidence?: boolean;
};

export function resolveMonthlyInvoicePaymentSource(
  evidence: MonthlyInvoicePaymentEvidence,
): MonthlyInvoicePaymentSource {
  const status = String(evidence.status ?? "").toLowerCase();
  const paid = Math.max(0, Math.round(Number(evidence.amountPaidCents ?? 0)));
  const total = Math.max(0, Math.round(Number(evidence.totalAmountCents ?? 0)));
  const closureReason = String(evidence.closureReason ?? "").toLowerCase();
  const kinds = new Set((evidence.eventKinds ?? []).map((k) => String(k).toLowerCase()));

  const zeroValue =
    closureReason === "zero_amount" ||
    (status === "paid" && total === 0 && paid === 0);
  const paystack =
    Boolean(evidence.hasPaystackLedger) ||
    kinds.has("payment_received") ||
    kinds.has("payment_applied");
  const manual =
    kinds.has("admin_mark_paid") &&
    !kinds.has("admin_revert_to_draft");
  const credit =
    Boolean(evidence.hasCleaningCreditEvidence) ||
    kinds.has("cleaning_credit_applied") ||
    kinds.has("cleaning_credit_settled");

  const sources = [
    paystack ? "paystack" : null,
    manual ? "manual_eft" : null,
    credit ? "cleaning_credit" : null,
    zeroValue ? "zero_value" : null,
  ].filter(Boolean) as MonthlyInvoicePaymentSource[];

  if (sources.length > 1) return "mixed";
  if (sources.length === 1) return sources[0];

  if (!["paid", "partially_paid", "refunded"].includes(status) && paid <= 0) {
    return "unpaid";
  }
  return "unknown";
}

export function monthlyInvoicePaymentSourceLabel(source: MonthlyInvoicePaymentSource): string {
  switch (source) {
    case "paystack":
      return "Paystack";
    case "manual_eft":
      return "Manual / EFT";
    case "cleaning_credit":
      return "Cleaning Credit";
    case "zero_value":
      return "Zero-value closure";
    case "mixed":
      return "Mixed";
    case "unpaid":
      return "Not paid";
    default:
      return "Unknown";
  }
}
