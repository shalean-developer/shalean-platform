export type CustomerProfileDto = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: "whatsapp" | "email" | "phone" | null;
  preferredNotificationChannel: "whatsapp" | "sms" | "email" | null;
  dateOfBirth: string | null;
  billingEmail: string | null;
  tier: string | null;
};

export type CustomerProfileResponse = { profile?: CustomerProfileDto; error?: string };

export type CustomerAddressRow = {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  suburb: string;
  city: string;
  postal_code: string;
  notes?: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CustomerAddressesListResponse = { addresses?: CustomerAddressRow[]; error?: string };
export type CustomerAddressResponse = { address?: CustomerAddressRow; error?: string };

export type CustomerMonthlyInvoiceItem = {
  id: string;
  month: string;
  status: string | null;
  dueDate: string | null;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceCents: number;
  isOverdue: boolean;
  isClosed: boolean;
  paymentLink: string | null;
  paystackReference: string | null;
  currencyCode: string | null;
  totalBookings: number | null;
};

export type CustomerPerVisitInvoiceItem = {
  bookingId: string;
  serviceName: string;
  date: string;
  amountZar: number;
  status: "paid";
  createdAt: string;
  hasPdf: boolean;
};

export type CustomerInvoicesListResponse = {
  monthly?: CustomerMonthlyInvoiceItem[];
  perVisit?: CustomerPerVisitInvoiceItem[];
  error?: string;
};
