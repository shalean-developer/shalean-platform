"use client";

import PaystackPop from "@paystack/inline-js";

type PaystackTransaction = {
  reference?: string;
  trans?: string;
  status?: string;
  message?: string;
};

export type InitializePaymentParams = {
  email: string;
  amount: number;
  reference: string;
  onSuccess: (transaction: PaystackTransaction) => void;
  onCancel?: () => void;
};

export function initializePayment({ email, amount, reference, onSuccess, onCancel }: InitializePaymentParams): void {
  const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!key || !key.trim()) {
    throw new Error("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not configured.");
  }
  const paystack = new PaystackPop();
  paystack.newTransaction({
    key: key.trim(),
    email,
    amount,
    reference,
    currency: "ZAR",
    onSuccess,
    onCancel,
  });
}
