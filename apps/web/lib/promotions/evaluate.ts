import type {
  AppliedPromotionDiscount,
  BookingEligibility,
  CheckoutPromotionContext,
  CustomerEligibility,
  DiscountType,
  PromotionBundleRow,
  PromotionEvaluationResult,
  PromotionRow,
} from "./types";

function asObject<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return {} as T;
}

export function normalizePromoCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function computeDiscountZar(args: {
  discountType: DiscountType;
  discountValue: number;
  subtotalZar: number;
  maxDiscountZar?: number | null;
}): number {
  const subtotal = Math.max(0, Math.round(args.subtotalZar));
  if (subtotal <= 0 || args.discountValue <= 0) return 0;
  if (args.discountType === "credit") return 0; // credits issued separately, not checkout % off

  let discount =
    args.discountType === "percent"
      ? Math.round((subtotal * args.discountValue) / 100)
      : Math.round(args.discountValue);

  if (args.maxDiscountZar != null && args.maxDiscountZar >= 0) {
    discount = Math.min(discount, Math.round(args.maxDiscountZar));
  }
  return Math.min(discount, subtotal);
}

export function isPromotionLive(promo: PromotionRow, now = new Date()): boolean {
  if (promo.status !== "active") return false;
  const t = now.getTime();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > t) return false;
  if (promo.ends_at && new Date(promo.ends_at).getTime() <= t) return false;
  if (promo.budget_zar != null && promo.budget_spent_zar >= promo.budget_zar) return false;
  if (promo.usage_limit_total != null && promo.redemptions_count >= promo.usage_limit_total) return false;
  return true;
}

export function checkCustomerEligibility(
  rules: CustomerEligibility,
  ctx: CheckoutPromotionContext,
): string | null {
  if (rules.requires_no_completed_bookings && ctx.completedBookingCount > 0) {
    return "Only available for customers with no completed bookings.";
  }
  if (rules.min_completed_bookings != null && ctx.completedBookingCount < rules.min_completed_bookings) {
    return `Requires at least ${rules.min_completed_bookings} completed booking(s).`;
  }
  if (rules.max_completed_bookings != null && ctx.completedBookingCount > rules.max_completed_bookings) {
    return `Only available for customers with at most ${rules.max_completed_bookings} completed booking(s).`;
  }
  if (rules.requires_membership && (ctx.membershipDiscountPercent ?? 0) <= 0) {
    return "Requires an active membership.";
  }
  if (rules.user_ids?.length && ctx.userId && !rules.user_ids.includes(ctx.userId)) {
    return "Not available for this account.";
  }
  return null;
}

export function checkBookingEligibility(
  rules: BookingEligibility,
  ctx: CheckoutPromotionContext,
  minBookingAmountZar: number,
): string | null {
  const minAmount = Math.max(minBookingAmountZar, rules.min_amount_zar ?? 0);
  if (ctx.subtotalZar < minAmount) {
    return `Minimum booking amount is R${minAmount}.`;
  }
  if (rules.service_slugs?.length && !rules.service_slugs.includes(ctx.serviceSlug)) {
    return "Not available for this service.";
  }
  if (rules.exclude_service_slugs?.length && rules.exclude_service_slugs.includes(ctx.serviceSlug)) {
    return "Not available for this service.";
  }
  if (rules.city_ids?.length && ctx.cityId && !rules.city_ids.includes(ctx.cityId)) {
    return "Not available in this city.";
  }
  if (rules.location_ids?.length && ctx.locationId && !rules.location_ids.includes(ctx.locationId)) {
    return "Not available in this area.";
  }
  return null;
}

function describeDiscount(promo: PromotionRow, discountZar: number): string {
  if (promo.discount_type === "percent") {
    return `${promo.discount_value}% off (${formatZar(discountZar)})`;
  }
  if (promo.discount_type === "fixed") {
    return `${formatZar(discountZar)} off`;
  }
  return promo.name;
}

export function formatZar(amount: number): string {
  return `R${Math.round(amount).toLocaleString("en-ZA")}`;
}

export function bundleMatches(
  bundle: PromotionBundleRow,
  serviceSlug: string,
  selectedExtraIds: string[],
): boolean {
  if (!bundle.enabled) return false;
  const extras = new Set(selectedExtraIds.map((id) => id.trim().toLowerCase()));
  const requiredServices = bundle.required_service_slugs.map((s) => s.toLowerCase());
  const requiredExtras = bundle.required_extra_ids.map((s) => s.toLowerCase());

  const serviceOk =
    requiredServices.length === 0 || requiredServices.includes(serviceSlug.toLowerCase());
  if (!serviceOk) return false;

  const extrasOk =
    requiredExtras.length === 0 || requiredExtras.every((id) => extras.has(id));
  if (!extrasOk) return false;

  // Count "services" as primary service + matching extras for min_services
  let count = 1;
  for (const id of requiredExtras) {
    if (extras.has(id)) count += 1;
  }
  if (requiredServices.length > 1) {
    count = Math.max(count, requiredServices.length);
  }
  return count >= bundle.min_services;
}

/**
 * Pure evaluation: given live promotions + optional bundles + context, pick applied discounts.
 * Referral checkout discount and cleaning credit are applied separately in confirm route.
 */
export function evaluatePromotions(args: {
  promotions: PromotionRow[];
  bundles?: PromotionBundleRow[];
  ctx: CheckoutPromotionContext;
  /** Per-promotion redemption counts for this customer (already applied). */
  customerRedemptionCounts?: Record<string, number>;
}): PromotionEvaluationResult {
  const now = args.ctx.now ?? new Date();
  const eligible: AppliedPromotionDiscount[] = [];
  const rejected: PromotionEvaluationResult["rejected"] = [];
  const code = normalizePromoCode(args.ctx.promoCode);
  const redemptionCounts = args.customerRedemptionCounts ?? {};

  for (const promo of args.promotions) {
    // Referral / birthday credit types are not checkout % discounts here
    if (promo.promotion_type === "referral" || promo.promotion_type === "birthday") {
      continue;
    }

    const live = isPromotionLive(promo, now);
    if (!live) {
      rejected.push({ promotionId: promo.id, name: promo.name, reason: "Promotion is not active." });
      continue;
    }

    const wantsCode = Boolean(promo.promo_code);
    const codeMatches = wantsCode && normalizePromoCode(promo.promo_code) === code;
    const autoCandidate = promo.auto_apply && !wantsCode;
    const codeCandidate = codeMatches;

    if (!autoCandidate && !codeCandidate) {
      if (code && wantsCode) {
        // wrong code for this promo — skip silently
      }
      continue;
    }

    const customerReason = checkCustomerEligibility(
      asObject<CustomerEligibility>(promo.customer_eligibility),
      args.ctx,
    );
    if (customerReason) {
      rejected.push({ promotionId: promo.id, name: promo.name, reason: customerReason });
      continue;
    }

    const bookingReason = checkBookingEligibility(
      asObject<BookingEligibility>(promo.booking_eligibility),
      args.ctx,
      Number(promo.min_booking_amount_zar ?? 0),
    );
    if (bookingReason) {
      rejected.push({ promotionId: promo.id, name: promo.name, reason: bookingReason });
      continue;
    }

    const used = redemptionCounts[promo.id] ?? 0;
    if (promo.usage_limit_per_customer != null && used >= promo.usage_limit_per_customer) {
      rejected.push({
        promotionId: promo.id,
        name: promo.name,
        reason: "You have already used this promotion.",
      });
      continue;
    }

    if (promo.promotion_type === "bundle") {
      const bundles = (args.bundles ?? []).filter((b) => b.promotion_id === promo.id && b.enabled);
      let best: AppliedPromotionDiscount | null = null;
      for (const bundle of bundles) {
        if (!bundleMatches(bundle, args.ctx.serviceSlug, args.ctx.selectedExtraIds)) continue;
        const discountZar = computeDiscountZar({
          discountType: bundle.discount_type,
          discountValue: Number(bundle.discount_value),
          subtotalZar: args.ctx.subtotalZar,
          maxDiscountZar: bundle.max_discount_zar,
        });
        if (discountZar <= 0) continue;
        const candidate: AppliedPromotionDiscount = {
          promotionId: promo.id,
          slug: promo.slug,
          name: bundle.name,
          discountZar,
          discountType: bundle.discount_type,
          description: `${bundle.name}: ${formatZar(discountZar)} off`,
          stackable: bundle.stackable,
          stackPriority: promo.stack_priority,
          source: "bundle",
          bundleId: bundle.id,
        };
        if (!best || candidate.discountZar > best.discountZar) best = candidate;
      }
      if (best) eligible.push(best);
      else if (codeCandidate) {
        rejected.push({
          promotionId: promo.id,
          name: promo.name,
          reason: "Selected services do not match a bundle offer.",
        });
      }
      continue;
    }

    if (promo.discount_type === "credit") continue;

    const discountZar = computeDiscountZar({
      discountType: promo.discount_type,
      discountValue: Number(promo.discount_value),
      subtotalZar: args.ctx.subtotalZar,
      maxDiscountZar: promo.max_discount_zar,
    });
    if (discountZar <= 0) continue;

    eligible.push({
      promotionId: promo.id,
      slug: promo.slug,
      name: promo.name,
      discountZar,
      discountType: promo.discount_type,
      description: describeDiscount(promo, discountZar),
      stackable: promo.stackable,
      stackPriority: promo.stack_priority,
      source: codeCandidate ? "code" : "auto",
    });
  }

  // Membership discount (from active plan) — treated as stackable auto discount
  const memberPct = args.ctx.membershipDiscountPercent ?? 0;
  if (memberPct > 0) {
    const discountZar = computeDiscountZar({
      discountType: "percent",
      discountValue: memberPct,
      subtotalZar: args.ctx.subtotalZar,
    });
    if (discountZar > 0) {
      eligible.push({
        promotionId: "membership",
        slug: "membership",
        name: "Membership discount",
        discountZar,
        discountType: "percent",
        description: `${memberPct}% member discount (${formatZar(discountZar)})`,
        stackable: true,
        stackPriority: 60,
        source: "membership",
      });
    }
  }

  const applied = resolveStacking(eligible);
  const totalDiscountZar = Math.min(
    args.ctx.subtotalZar,
    applied.reduce((sum, d) => sum + d.discountZar, 0),
  );

  return { eligible, rejected, applied, totalDiscountZar };
}

/**
 * Non-stackable: keep the single best (highest discount, then lowest stack_priority).
 * Stackable: keep all that don't conflict with the chosen non-stackable set.
 * If a non-stackable wins, drop other non-stackable; keep stackable unless total would exceed subtotal (caller caps).
 */
export function resolveStacking(eligible: AppliedPromotionDiscount[]): AppliedPromotionDiscount[] {
  if (eligible.length === 0) return [];

  const nonStackable = eligible
    .filter((e) => !e.stackable)
    .sort((a, b) => b.discountZar - a.discountZar || a.stackPriority - b.stackPriority);
  const stackable = eligible
    .filter((e) => e.stackable)
    .sort((a, b) => a.stackPriority - b.stackPriority || b.discountZar - a.discountZar);

  const chosen: AppliedPromotionDiscount[] = [];
  if (nonStackable[0]) chosen.push(nonStackable[0]);
  for (const s of stackable) chosen.push(s);

  // Prefer code-applied over weaker auto when both non-stackable of same promo family
  return chosen;
}

export function mapPromotionRow(raw: Record<string, unknown>): PromotionRow {
  return {
    id: String(raw.id),
    slug: String(raw.slug),
    name: String(raw.name),
    description: (raw.description as string | null) ?? null,
    promotion_type: raw.promotion_type as PromotionRow["promotion_type"],
    status: raw.status as PromotionRow["status"],
    starts_at: (raw.starts_at as string | null) ?? null,
    ends_at: (raw.ends_at as string | null) ?? null,
    banner_image_url: (raw.banner_image_url as string | null) ?? null,
    landing_page_path: (raw.landing_page_path as string | null) ?? null,
    promo_code: (raw.promo_code as string | null) ?? null,
    auto_apply: Boolean(raw.auto_apply),
    discount_type: (raw.discount_type as DiscountType) ?? "percent",
    discount_value: Number(raw.discount_value ?? 0),
    max_discount_zar: raw.max_discount_zar != null ? Number(raw.max_discount_zar) : null,
    min_booking_amount_zar: Number(raw.min_booking_amount_zar ?? 0),
    customer_eligibility: asObject(raw.customer_eligibility),
    booking_eligibility: asObject(raw.booking_eligibility),
    usage_limit_total: raw.usage_limit_total != null ? Number(raw.usage_limit_total) : null,
    usage_limit_per_customer:
      raw.usage_limit_per_customer != null ? Number(raw.usage_limit_per_customer) : null,
    budget_zar: raw.budget_zar != null ? Number(raw.budget_zar) : null,
    budget_spent_zar: Number(raw.budget_spent_zar ?? 0),
    stackable: Boolean(raw.stackable),
    stack_priority: Number(raw.stack_priority ?? 100),
    show_on_homepage: Boolean(raw.show_on_homepage),
    show_on_booking: Boolean(raw.show_on_booking),
    show_on_pricing: Boolean(raw.show_on_pricing),
    show_announcement_bar: Boolean(raw.show_announcement_bar),
    display_config: asObject(raw.display_config),
    views_count: Number(raw.views_count ?? 0),
    clicks_count: Number(raw.clicks_count ?? 0),
    bookings_started_count: Number(raw.bookings_started_count ?? 0),
    bookings_completed_count: Number(raw.bookings_completed_count ?? 0),
    revenue_generated_zar: Number(raw.revenue_generated_zar ?? 0),
    redemptions_count: Number(raw.redemptions_count ?? 0),
    created_by: (raw.created_by as string | null) ?? null,
    updated_by: (raw.updated_by as string | null) ?? null,
    duplicated_from_id: (raw.duplicated_from_id as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}
