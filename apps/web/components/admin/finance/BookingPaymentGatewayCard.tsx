"use client";

import Link from "next/link";
import type { PaymentTransactionRow } from "@/lib/payments/paymentTransactionTypes";

const FEE_METHOD_LABELS: Record<string, string> = {
  paystack_reported: "Paystack reported",
  calculated_sa_local_card: "Calculated (SA local card)",
  calculated_sa_international_card: "Calculated (SA international)",
  calculated_sa_eft: "Calculated (SA EFT)",
  calculated_sa_default: "Calculated (SA default)",
  manual: "Manual",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  pending: "Pending settlement",
  settled: "Settled",
  failed: "Failed",
  reversed: "Reversed",
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

function shortenGatewayReference(ref: string, tail = 6): string {
  const trimmed = ref.trim();
  if (trimmed.length <= 22) return trimmed;
  const parts = trimmed.split("_");
  if (parts.length >= 2) {
    const prefix = parts.length >= 3 ? `${parts[0]}_${parts[1]}` : parts[0];
    return `${prefix}_…${trimmed.slice(-tail)}`;
  }
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-tail)}`;
}

function GatewayDetailRow({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span
        className={
          mono
            ? "font-mono text-xs text-zinc-800"
            : strong
              ? "font-semibold text-zinc-900"
              : "font-medium text-zinc-900"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function BookingPaymentGatewayCard({
  paymentTransaction,
  reconciliationHref = "/office/payment-reconciliation",
}: {
  paymentTransaction: PaymentTransactionRow | null;
  reconciliationHref?: string;
}) {
  if (!paymentTransaction) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-500">
        No gateway payment ledger row yet. Paystack fees will appear here after payment is recorded or backfilled.
      </div>
    );
  }

  const tx = paymentTransaction;
  const feeLabel = FEE_METHOD_LABELS[tx.fee_calculation_method] ?? tx.fee_calculation_method;
  const settlementLabel = SETTLEMENT_LABELS[tx.settlement_status] ?? tx.settlement_status;

  return (
    <div className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gateway settlement</p>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
          {tx.gateway}
        </span>
      </div>
      <div title={tx.gateway_reference}>
        <GatewayDetailRow label="Reference" value={shortenGatewayReference(tx.gateway_reference)} mono />
      </div>
      <GatewayDetailRow label="Gross" value={formatZar(tx.amount_cents)} />
      <GatewayDetailRow label="Processing fee" value={formatZar(tx.processing_fee_cents)} />
      <GatewayDetailRow label="Net settlement" value={formatZar(tx.net_settlement_cents)} strong />
      <GatewayDetailRow label="Fee source" value={feeLabel} />
      <GatewayDetailRow label="Settlement" value={settlementLabel} />
      {tx.payment_channel ? <GatewayDetailRow label="Channel" value={tx.payment_channel} /> : null}
      {tx.settlement_date ? <GatewayDetailRow label="Settled on" value={tx.settlement_date} /> : null}
      <p className="pt-1 text-[11px] text-zinc-500">
        <Link href={reconciliationHref} className="font-medium text-[#408df7] hover:underline">
          Open reconciliation →
        </Link>
      </p>
    </div>
  );
}
