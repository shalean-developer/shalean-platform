/** Minimal Zoho Books API shapes used by zohoBooksService. */

export type ZohoContact = {
  contact_id: string;
  contact_name: string;
  email: string;
};

export type ZohoLineItem = {
  name: string;
  description?: string;
  rate: number;
  quantity: number;
};

export type ZohoInvoiceInput = {
  customer_id: string;
  invoice_number?: string;
  date: string;
  due_date: string;
  line_items: ZohoLineItem[];
  notes?: string;
  /** ISO-4217 currency code, e.g. "ZAR" */
  currency_code?: string;
  reference_number?: string;
  /**
   * Links this invoice back to the estimate it was converted from so Zoho marks
   * the source estimate as "Invoiced" — keeps Zoho in step with Shalean's own
   * quote→invoice conversion.
   */
  invoiced_estimate_id?: string;
};

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total: number;
  balance: number;
  customer_id?: string;
  tax_total?: number;
  currency_code?: string;
};

export type ZohoVendorContact = {
  contact_id: string;
  contact_name: string;
  email?: string;
};

export type ZohoExpenseInput = {
  account_id: string;
  date: string;
  amount: number;
  vendor_id?: string;
  description?: string;
  reference_number?: string;
  currency_code?: string;
  is_billable?: boolean;
};

export type ZohoExpense = {
  expense_id: string;
  account_id: string;
  date: string;
  amount: number;
  status: string;
};

export type ZohoExpenseCreateResponse = {
  code: number;
  message: string;
  expense: ZohoExpense;
};

export type ZohoBankAccount = {
  account_id: string;
  account_name: string;
  account_type: string;
  balance: number;
  currency_code?: string;
};

export type ZohoBankAccountsResponse = {
  code: number;
  message: string;
  bankaccounts: ZohoBankAccount[];
};

export type ZohoChartAccount = {
  account_id: string;
  account_name: string;
  account_type: string;
};

export type ZohoChartAccountsResponse = {
  code: number;
  message: string;
  chartofaccounts: ZohoChartAccount[];
};

export type ZohoPaymentInput = {
  customer_id: string;
  payment_mode: string;
  amount: number;
  date: string;
  invoices: Array<{ invoice_id: string; amount_applied: number }>;
  reference_number?: string;
};

/** Wrapper returned by Zoho for contact list */
export type ZohoContactListResponse = {
  code: number;
  message: string;
  contacts: ZohoContact[];
};

export type ZohoContactCreateResponse = {
  code: number;
  message: string;
  contact: ZohoContact;
};

export type ZohoInvoiceCreateResponse = {
  code: number;
  message: string;
  invoice: ZohoInvoice;
};

export type ZohoInvoiceUpdateResponse = {
  code: number;
  message: string;
  invoice: ZohoInvoice;
};

export type ZohoInvoiceGetResponse = {
  code: number;
  message: string;
  invoice: ZohoInvoice;
};

export type ZohoPaymentCreateResponse = {
  code: number;
  message: string;
  payment: { payment_id: string; amount: number };
};

export type ZohoEstimateInput = {
  customer_id: string;
  date: string;
  expiry_date?: string;
  line_items: ZohoLineItem[];
  notes?: string;
  currency_code?: string;
  reference_number?: string;
};

export type ZohoEstimate = {
  estimate_id: string;
  estimate_number: string;
  status: string;
  total: number;
};

export type ZohoEstimateCreateResponse = {
  code: number;
  message: string;
  estimate: ZohoEstimate;
};

export type ZohoEstimateUpdateResponse = {
  code: number;
  message: string;
  estimate: ZohoEstimate;
};

export type ZohoEstimateGetResponse = {
  code: number;
  message: string;
  estimate: ZohoEstimate;
};
