export type ExpenseApprovalStage = "finance" | "manager" | "owner" | "complete" | "rejected";

export type ExpenseStatus = "pending" | "approved" | "rejected";

export type ExpensePaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "paystack"
  | "eft"
  | "other";

export type ExpenseSyncStatus = "not_synced" | "pending" | "synced" | "failed";

export type ExpenseCategoryRow = {
  id: string;
  group_name: string;
  name: string;
  is_system: boolean;
  is_active: boolean;
};

export type ExpenseVendorRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  expense_count?: number;
  total_spent_cents?: number;
};

export type ExpenseAccountRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type ExpenseRow = {
  id: string;
  expense_date: string;
  category_id: string;
  description: string;
  amount_cents: number;
  payment_method: ExpensePaymentMethod;
  paid_from_account_id: string | null;
  vendor_id: string | null;
  branch_id: string;
  booking_id: string | null;
  receipt_path: string | null;
  receipt_mime: string | null;
  notes: string | null;
  status: ExpenseStatus;
  rejection_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_stage: ExpenseApprovalStage;
  recurring_expense_id: string | null;
  payment_transaction_id: string | null;
  processing_fees_cents: number;
  platform_fees_cents: number;
  external_accounting_id: string | null;
  sync_status: ExpenseSyncStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseListItem = ExpenseRow & {
  category_name: string;
  category_group: string;
  vendor_name: string | null;
  branch_name: string;
  paid_from_account_name: string | null;
  created_by_email: string | null;
  approved_by_email: string | null;
  booking_ref: string | null;
};

export type ExpenseSummary = {
  total_expenses_cents: number;
  today_expenses_cents: number;
  month_expenses_cents: number;
  pending_count: number;
  pending_cents: number;
  approved_cents: number;
  approved_count: number;
  avg_daily_spend_cents: number;
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  paystack: "Paystack",
  eft: "EFT",
  other: "Other",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
