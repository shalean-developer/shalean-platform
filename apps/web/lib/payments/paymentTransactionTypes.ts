export type PaymentGateway = "paystack" | "peach" | "stripe" | "other";

export type PaymentEntityType = "booking" | "monthly_invoice" | "sales_document";

export type FeeCalculationMethod =
  | "paystack_reported"
  | "calculated_sa_local_card"
  | "calculated_sa_international_card"
  | "calculated_sa_eft"
  | "calculated_sa_default"
  | "manual";

export type SettlementStatus = "pending" | "settled" | "failed" | "reversed";

export type PaymentTransactionRow = {
  id: string;
  gateway: PaymentGateway;
  gateway_reference: string;
  gateway_transaction_id: string | null;
  entity_type: PaymentEntityType;
  entity_id: string;
  amount_cents: number;
  currency_code: string;
  processing_fee_cents: number;
  processing_fee_vat_cents: number | null;
  net_settlement_cents: number;
  fee_calculation_method: FeeCalculationMethod;
  settlement_status: SettlementStatus;
  settlement_date: string | null;
  payment_channel: string | null;
  expense_id: string | null;
  booking_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaystackChargePayload = {
  reference?: string;
  amount?: number;
  currency?: string;
  fees?: number;
  fees_breakdown?: unknown;
  channel?: string;
  paid_at?: string;
  id?: number | string;
  international_format_transaction?: boolean;
  authorization?: { country_code?: string; brand?: string };
  [key: string]: unknown;
};

export type ResolvedProcessingFee = {
  processing_fee_cents: number;
  processing_fee_vat_cents: number | null;
  fee_calculation_method: FeeCalculationMethod;
  payment_channel: string | null;
};
