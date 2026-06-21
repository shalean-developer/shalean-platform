import type { RecurringDiscountRule } from "@/lib/booking-v2/types";
import { defaultBookingV2FeesConfig, parseBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";

export type CustomerRecurringPlanOption = {
  frequency: "weekly" | "biweekly" | "monthly";
  title: string;
  description: string;
  savingLabel: string | null;
  discountPercent: number;
  bookHref: string;
  popular: boolean;
};

const PLAN_COPY: Record<
  CustomerRecurringPlanOption["frequency"],
  { title: string; description: string }
> = {
  weekly: {
    title: "Weekly",
    description: "A fresh clean every week — ideal for busy households and high-traffic homes.",
  },
  biweekly: {
    title: "Bi-weekly",
    description: "Every two weeks — a balanced schedule for most families.",
  },
  monthly: {
    title: "Monthly",
    description: "Once a month for a thorough refresh of your whole home.",
  },
};

function discountPercentForRule(rule: RecurringDiscountRule | undefined): number {
  if (!rule) return 0;
  if (rule.type === "percent") return Math.round(rule.value);
  return 0;
}

function savingLabelFromRule(rule: RecurringDiscountRule | undefined): string | null {
  if (!rule) return null;
  if (rule.type === "percent" && rule.value > 0) return `Save ${Math.round(rule.value)}%`;
  if (rule.type === "fixed" && rule.value > 0) {
    return `Save R ${Math.round(rule.value).toLocaleString("en-ZA")}`;
  }
  return null;
}

function resolveDiscountRule(
  discounts: Record<string, RecurringDiscountRule>,
  frequency: CustomerRecurringPlanOption["frequency"],
): RecurringDiscountRule | undefined {
  if (frequency === "biweekly") {
    return discounts.biweekly ?? discounts.fortnightly;
  }
  return discounts[frequency];
}

/** Build customer-facing recurring plan cards from `pricing_booking_config` (or defaults). */
export function buildCustomerRecurringPlanOptions(configJson: unknown): CustomerRecurringPlanOption[] {
  const fees = parseBookingV2FeesConfig(configJson ?? defaultBookingV2FeesConfig());
  const discounts = fees.recurringDiscounts;

  const frequencies: CustomerRecurringPlanOption["frequency"][] = ["weekly", "biweekly", "monthly"];
  const options = frequencies.map((frequency) => {
    const rule = resolveDiscountRule(discounts, frequency);
    const copy = PLAN_COPY[frequency];
    return {
      frequency,
      title: copy.title,
      description: copy.description,
      savingLabel: savingLabelFromRule(rule),
      discountPercent: discountPercentForRule(rule),
      bookHref: "/account/book",
      popular: false,
    };
  });

  let popularIdx = 1;
  let best = options[popularIdx]?.discountPercent ?? 0;
  for (let i = 0; i < options.length; i += 1) {
    const pct = options[i]?.discountPercent ?? 0;
    if (pct > best) {
      best = pct;
      popularIdx = i;
    }
  }
  if (options[popularIdx]) options[popularIdx]!.popular = true;

  return options;
}
