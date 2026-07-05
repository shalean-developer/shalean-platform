import "server-only";

import type { OfficeOpsHealthSignals } from "@/lib/admin/collectOfficeOpsHealthSignals";
import { buildOfficeOpsHealthSummary, type OfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { applyOpsHealthAcknowledgements } from "@/lib/observability/opsHealthAcknowledgements";

/** Builds the full ops-health page payload from collected signals, with ack-aware scanner data. */
export function assembleOfficeOpsHealthResponse(
  signals: OfficeOpsHealthSignals,
  options?: {
    includeAcknowledged?: boolean;
    metricsRecorded?: boolean;
  },
): OfficeOpsHealthSummary {
  const productionHealth = options?.includeAcknowledged ? signals.rawProductionHealth : signals.productionHealth;
  const ackView =
    signals.rawProductionHealth != null
      ? applyOpsHealthAcknowledgements(signals.rawProductionHealth, signals.acknowledgements, {
          includeAcknowledged: options?.includeAcknowledged,
        })
      : null;

  const summary = buildOfficeOpsHealthSummary({
    fetchedAt: signals.fetchedAt,
    productionHealth,
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

  const acknowledgedHidden = ackView?.acknowledgedFindings.reduce((sum, finding) => sum + finding.count, 0) ?? 0;

  return {
    ...summary,
    scanner: {
      ...summary.scanner,
      lastScan: {
        ...summary.scanner.lastScan,
        metricsRecorded: options?.metricsRecorded === true,
      },
      counts: {
        ...summary.scanner.counts,
        acknowledgedHidden,
      },
      acknowledgedSummaries: ackView?.acknowledgedFindings ?? [],
      acknowledgements: signals.acknowledgements,
    },
  };
}
