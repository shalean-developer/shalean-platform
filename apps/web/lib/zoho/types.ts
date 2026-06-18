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
};

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total: number;
  balance: number;
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

export type ZohoPaymentCreateResponse = {
  code: number;
  message: string;
  payment: { payment_id: string; amount: number };
};
