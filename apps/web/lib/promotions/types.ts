/** Shared types for the Promotion & Campaign Management System. */

export type PromotionType =
  | "first_booking"
  | "referral"
  | "membership"
  | "bundle"
  | "birthday"
  | "seasonal"
  | "promo_code"
  | "custom";

export type PromotionStatus = "draft" | "scheduled" | "active" | "paused" | "expired" | "ended";

export type DiscountType = "percent" | "fixed" | "credit";

export type CustomerEligibility = {
  requires_no_completed_bookings?: boolean;
  requires_membership?: boolean;
  membership_plan_slugs?: string[];
  min_completed_bookings?: number;
  max_completed_bookings?: number;
  customer_segments?: string[];
  one_per_year?: boolean;
  /** Restrict to these user IDs (admin targeting). */
  user_ids?: string[];
};

export type BookingEligibility = {
  service_slugs?: string[];
  city_ids?: string[];
  suburb_ids?: string[];
  location_ids?: string[];
  min_amount_zar?: number;
  exclude_service_slugs?: string[];
};

export type PromotionDisplayConfig = {
  headline?: string;
  subheadline?: string;
  cta?: string;
  landing?: string;
  colours?: { primary?: string; accent?: string };
  countdown?: boolean;
  validity_days?: number;
};

export type PromotionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  promotion_type: PromotionType;
  status: PromotionStatus;
  starts_at: string | null;
  ends_at: string | null;
  banner_image_url: string | null;
  landing_page_path: string | null;
  promo_code: string | null;
  auto_apply: boolean;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_zar: number | null;
  min_booking_amount_zar: number;
  customer_eligibility: CustomerEligibility;
  booking_eligibility: BookingEligibility;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  budget_zar: number | null;
  budget_spent_zar: number;
  stackable: boolean;
  stack_priority: number;
  show_on_homepage: boolean;
  show_on_booking: boolean;
  show_on_pricing: boolean;
  show_announcement_bar: boolean;
  show_popup?: boolean;
  show_featured_card?: boolean;
  show_dashboard_card?: boolean;
  show_booking_banner?: boolean;
  hero_image_url?: string | null;
  logo_url?: string | null;
  cta_label?: string | null;
  terms_html?: string | null;
  qr_code_data_url?: string | null;
  content_generated_at?: string | null;
  template_key?: string | null;
  display_config: PromotionDisplayConfig;
  views_count: number;
  clicks_count: number;
  bookings_started_count: number;
  bookings_completed_count: number;
  revenue_generated_zar: number;
  redemptions_count: number;
  created_by: string | null;
  updated_by: string | null;
  duplicated_from_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PromotionBundleRow = {
  id: string;
  promotion_id: string;
  name: string;
  required_service_slugs: string[];
  required_extra_ids: string[];
  min_services: number;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_discount_zar: number | null;
  stackable: boolean;
  enabled: boolean;
  sort_order: number;
};

export type MembershipPlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  billing_frequency: "weekly" | "biweekly" | "monthly";
  price_zar: number;
  discount_percent: number;
  benefits: string[];
  priority_booking: boolean;
  preferred_cleaner: boolean;
  birthday_bonus: boolean;
  member_only_offers: boolean;
  enabled: boolean;
  sort_order: number;
};

export type CustomerMembershipRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: "active" | "paused" | "cancelled" | "expired" | "past_due";
  started_at: string;
  current_period_start: string;
  current_period_end: string | null;
  cancelled_at: string | null;
  savings_to_date_zar: number;
  preferred_cleaner_id: string | null;
};

export type BirthdayRewardRow = {
  id: string;
  user_id: string;
  promotion_id: string | null;
  reward_year: number;
  credit_zar: number;
  expires_at: string;
  status: "issued" | "redeemed" | "expired" | "revoked";
  email_sent_at: string | null;
  redeemed_booking_id: string | null;
};

export type CheckoutPromotionContext = {
  userId: string | null;
  customerEmail: string;
  completedBookingCount: number;
  serviceSlug: string;
  selectedExtraIds: string[];
  cityId?: string | null;
  locationId?: string | null;
  suburb?: string | null;
  /** Prefer UUID suburb/location id when restricting by suburb_ids. */
  suburbId?: string | null;
  subtotalZar: number;
  promoCode?: string | null;
  membershipDiscountPercent?: number;
  /** Active membership plan slug when customer has a membership. */
  membershipPlanSlug?: string | null;
  /** Segment tags for the customer (admin CRM). */
  customerSegments?: string[];
  /** True when this promo code/id was already redeemed by the customer this calendar year. */
  promoRedeemedThisYear?: boolean;
  now?: Date;
};

export type AppliedPromotionDiscount = {
  promotionId: string;
  slug: string;
  name: string;
  discountZar: number;
  discountType: DiscountType;
  description: string;
  stackable: boolean;
  stackPriority: number;
  source: "auto" | "code" | "bundle" | "membership";
  bundleId?: string;
};

export type PromotionEvaluationResult = {
  eligible: AppliedPromotionDiscount[];
  rejected: { promotionId: string; name: string; reason: string }[];
  /** Best non-stackable + all stackable, after conflict resolution. */
  applied: AppliedPromotionDiscount[];
  totalDiscountZar: number;
};

export type CreatePromotionInput = {
  name: string;
  slug?: string;
  description?: string | null;
  promotion_type: PromotionType;
  status?: PromotionStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  banner_image_url?: string | null;
  landing_page_path?: string | null;
  promo_code?: string | null;
  auto_apply?: boolean;
  discount_type?: DiscountType;
  discount_value?: number;
  max_discount_zar?: number | null;
  min_booking_amount_zar?: number;
  customer_eligibility?: CustomerEligibility;
  booking_eligibility?: BookingEligibility;
  usage_limit_total?: number | null;
  usage_limit_per_customer?: number | null;
  budget_zar?: number | null;
  stackable?: boolean;
  stack_priority?: number;
  show_on_homepage?: boolean;
  show_on_booking?: boolean;
  show_on_pricing?: boolean;
  show_announcement_bar?: boolean;
  show_popup?: boolean;
  show_featured_card?: boolean;
  show_dashboard_card?: boolean;
  show_booking_banner?: boolean;
  hero_image_url?: string | null;
  logo_url?: string | null;
  cta_label?: string | null;
  terms_html?: string | null;
  template_key?: string | null;
  display_config?: PromotionDisplayConfig;
};
