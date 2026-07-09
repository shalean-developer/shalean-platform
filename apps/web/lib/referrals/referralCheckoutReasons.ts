/** Machine-readable reasons when a stored referral code cannot apply at checkout. */
export type ReferralCheckoutInvalidReason =
  | "invalid_format"
  | "code_not_found"
  | "self_referral"
  | "not_first_booking"
  | "program_disabled"
  | "service_ineligible"
  | "min_booking_not_met"
  | "device_already_used"
  | "code_expired"
  | "max_uses_reached";

export const REFERRAL_CHECKOUT_REASON_MESSAGES: Record<ReferralCheckoutInvalidReason, string> = {
  invalid_format: "That referral link doesn't look valid. Ask your friend to resend their link.",
  code_not_found: "We couldn't find that referral code. Check the link or ask your friend to share it again.",
  self_referral: "You can't use your own referral code on your booking.",
  not_first_booking: "Referral discounts apply to your first paid Shalean booking only.",
  program_disabled: "Referral rewards aren't available right now. You can still complete your booking at the full price.",
  service_ineligible: "Referral discounts don't apply to this service type.",
  min_booking_not_met: "Your booking total is below the minimum for a referral discount.",
  device_already_used: "This referral offer was already used on this device. Referral discounts are limited to one per person.",
  code_expired: "That referral code has expired.",
  max_uses_reached: "That referral code has reached its usage limit.",
};

export function referralCheckoutInvalidMessage(
  reason: ReferralCheckoutInvalidReason,
  opts?: { minBookingZar?: number },
): string {
  if (reason === "min_booking_not_met" && opts?.minBookingZar != null && opts.minBookingZar > 0) {
    return `Referral discounts require a booking of at least R ${opts.minBookingZar.toLocaleString("en-ZA")}.`;
  }
  return REFERRAL_CHECKOUT_REASON_MESSAGES[reason];
}
