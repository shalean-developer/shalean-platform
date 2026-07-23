"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type BookingBillingMode = "per_booking" | "monthly" | "payment_already_received";

type Props = {
  value: BookingBillingMode;
  profileBillingType: string;
  disabled?: boolean;
  onChange: (next: BookingBillingMode) => void;
};

function normProfileBilling(s: string): "per_booking" | "monthly" {
  return s.toLowerCase() === "monthly" ? "monthly" : "per_booking";
}

export function AdminBookingBillingMode({ value, profileBillingType, disabled = false, onChange }: Props) {
  const profileMode = normProfileBilling(profileBillingType);
  const differsFromProfile =
    value === "payment_already_received" ? true : value !== profileMode;

  const segBtn = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
      disabled && "cursor-not-allowed opacity-60",
    );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Billing for this booking</Label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          className={segBtn(value === "per_booking")}
          onClick={() => onChange("per_booking")}
        >
          Per booking
        </button>
        <button
          type="button"
          disabled={disabled}
          className={segBtn(value === "monthly")}
          onClick={() => onChange("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          disabled={disabled}
          className={segBtn(value === "payment_already_received")}
          onClick={() => onChange("payment_already_received")}
        >
          Payment already received
        </button>
      </div>
      {value === "payment_already_received" ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Creates the booking without a Paystack link, records the off-platform payment, verifies the
          paid invoice, then emails a payment confirmation receipt (and paid invoice PDF when available).
          No unpaid invoice or payment reminder is sent.
        </p>
      ) : differsFromProfile ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          One-off override — customer account default is {profileMode === "monthly" ? "Monthly" : "Per booking"}.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Matches customer account default ({profileMode === "monthly" ? "Monthly" : "Per booking"}).
        </p>
      )}
    </div>
  );
}
