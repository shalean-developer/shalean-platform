import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeCampaignTermsHtml } from "./campaignTermsHtml";
import {
  evaluatePromotions,
  mapPromotionRow,
  normalizePromoCode,
} from "./evaluate";
import type {
  AppliedPromotionDiscount,
  CheckoutPromotionContext,
  CreatePromotionInput,
  PromotionBundleRow,
  PromotionEvaluationResult,
  PromotionRow,
  PromotionStatus,
} from "./types";

type Admin = SupabaseClient;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `promo-${Date.now()}`;
}

export async function syncPromotionStatuses(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc("sync_promotion_statuses");
  if (error) {
    // Fallback without RPC
    const now = new Date().toISOString();
    await admin
      .from("promotions")
      .update({ status: "active", updated_at: now })
      .eq("status", "scheduled")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`);
    await admin
      .from("promotions")
      .update({ status: "expired", updated_at: now })
      .in("status", ["active", "scheduled", "paused"])
      .not("ends_at", "is", null)
      .lte("ends_at", now);
    return 0;
  }
  return Number(data ?? 0);
}

export async function listPromotions(
  admin: Admin,
  filters?: {
    status?: PromotionStatus | PromotionStatus[];
    type?: string;
    search?: string;
  },
): Promise<PromotionRow[]> {
  let q = admin.from("promotions").select("*").order("updated_at", { ascending: false });
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    q = q.in("status", statuses);
  }
  if (filters?.type) q = q.eq("promotion_type", filters.type);
  if (filters?.search?.trim()) {
    const s = filters.search.trim();
    q = q.or(`name.ilike.%${s}%,slug.ilike.%${s}%,promo_code.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPromotionRow(row as Record<string, unknown>));
}

export async function getPromotionById(admin: Admin, id: string): Promise<PromotionRow | null> {
  const { data, error } = await admin.from("promotions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPromotionRow(data as Record<string, unknown>) : null;
}

export type PromotionDisplaySurface =
  | "homepage"
  | "booking"
  | "pricing"
  | "announcement"
  | "popup"
  | "featured"
  | "dashboard"
  | "booking_banner";

export async function getActiveDisplayPromotions(
  admin: Admin,
  surface: PromotionDisplaySurface,
): Promise<PromotionRow[]> {
  await syncPromotionStatuses(admin);
  let q = admin.from("promotions").select("*").eq("status", "active");
  if (surface === "homepage") q = q.eq("show_on_homepage", true);
  if (surface === "booking") q = q.eq("show_on_booking", true);
  if (surface === "pricing") q = q.eq("show_on_pricing", true);
  if (surface === "announcement") q = q.eq("show_announcement_bar", true);
  if (surface === "popup") q = q.eq("show_popup", true);
  if (surface === "featured") q = q.eq("show_featured_card", true);
  if (surface === "dashboard") q = q.eq("show_dashboard_card", true);
  if (surface === "booking_banner") q = q.eq("show_booking_banner", true);
  const { data, error } = await q.order("stack_priority", { ascending: true });
  if (error) throw new Error(error.message);
  const now = new Date();
  return (data ?? [])
    .map((row) => mapPromotionRow(row as Record<string, unknown>))
    .filter((p) => {
      if (p.starts_at && new Date(p.starts_at) > now) return false;
      if (p.ends_at && new Date(p.ends_at) <= now) return false;
      return true;
    });
}

export async function createPromotion(
  admin: Admin,
  input: CreatePromotionInput,
  actor?: string,
): Promise<PromotionRow> {
  const slug = input.slug?.trim() || slugify(input.name);
  const row = {
    name: input.name.trim(),
    slug,
    description: input.description ?? null,
    promotion_type: input.promotion_type,
    status: input.status ?? "draft",
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    banner_image_url: input.banner_image_url ?? null,
    landing_page_path: input.landing_page_path ?? null,
    promo_code: input.promo_code ? normalizePromoCode(input.promo_code) : null,
    auto_apply: input.auto_apply ?? false,
    discount_type: input.discount_type ?? "percent",
    discount_value: input.discount_value ?? 0,
    max_discount_zar: input.max_discount_zar ?? null,
    min_booking_amount_zar: input.min_booking_amount_zar ?? 0,
    customer_eligibility: input.customer_eligibility ?? {},
    booking_eligibility: input.booking_eligibility ?? {},
    usage_limit_total: input.usage_limit_total ?? null,
    usage_limit_per_customer: input.usage_limit_per_customer ?? null,
    budget_zar: input.budget_zar ?? null,
    stackable: input.stackable ?? false,
    stack_priority: input.stack_priority ?? 100,
    show_on_homepage: input.show_on_homepage ?? false,
    show_on_booking: input.show_on_booking ?? false,
    show_on_pricing: input.show_on_pricing ?? false,
    show_announcement_bar: input.show_announcement_bar ?? false,
    show_popup: input.show_popup ?? false,
    show_featured_card: input.show_featured_card ?? false,
    show_dashboard_card: input.show_dashboard_card ?? false,
    show_booking_banner: input.show_booking_banner ?? input.show_on_booking ?? false,
    hero_image_url: input.hero_image_url ?? null,
    logo_url: input.logo_url ?? null,
    cta_label: input.cta_label ?? null,
    terms_html: input.terms_html ? sanitizeCampaignTermsHtml(input.terms_html) : null,
    template_key: input.template_key ?? null,
    display_config: input.display_config ?? {},
    created_by: actor ?? null,
    updated_by: actor ?? null,
  };
  const { data, error } = await admin.from("promotions").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  await writeAudit(admin, data.id, "create", actor, null, data);
  return mapPromotionRow(data as Record<string, unknown>);
}

export async function updatePromotion(
  admin: Admin,
  id: string,
  patch: Partial<CreatePromotionInput> & { status?: PromotionStatus },
  actor?: string,
): Promise<PromotionRow> {
  const before = await getPromotionById(admin, id);
  if (!before) throw new Error("Promotion not found.");

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actor ?? null };
  const keys: (keyof CreatePromotionInput | "status")[] = [
    "name",
    "slug",
    "description",
    "promotion_type",
    "status",
    "starts_at",
    "ends_at",
    "banner_image_url",
    "landing_page_path",
    "promo_code",
    "auto_apply",
    "discount_type",
    "discount_value",
    "max_discount_zar",
    "min_booking_amount_zar",
    "customer_eligibility",
    "booking_eligibility",
    "usage_limit_total",
    "usage_limit_per_customer",
    "budget_zar",
    "stackable",
    "stack_priority",
    "show_on_homepage",
    "show_on_booking",
    "show_on_pricing",
    "show_announcement_bar",
    "show_popup",
    "show_featured_card",
    "show_dashboard_card",
    "show_booking_banner",
    "hero_image_url",
    "logo_url",
    "cta_label",
    "terms_html",
    "template_key",
    "display_config",
  ];
  for (const key of keys) {
    if (key in patch && patch[key as keyof typeof patch] !== undefined) {
      let val = patch[key as keyof typeof patch];
      if (key === "promo_code" && typeof val === "string") val = normalizePromoCode(val) || null;
      if (key === "terms_html") val = typeof val === "string" ? sanitizeCampaignTermsHtml(val) : null;
      update[key] = val;
    }
  }

  const { data, error } = await admin.from("promotions").update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await writeAudit(admin, id, "update", actor, before, data);
  return mapPromotionRow(data as Record<string, unknown>);
}

export async function setPromotionStatus(
  admin: Admin,
  id: string,
  status: PromotionStatus,
  actor?: string,
): Promise<PromotionRow> {
  return updatePromotion(admin, id, { status }, actor);
}

/** Reactivate a paused, ended, or expired campaign. Clears a past ends_at so sync does not re-expire it. */
export async function resumePromotion(
  admin: Admin,
  id: string,
  actor?: string,
): Promise<PromotionRow> {
  const before = await getPromotionById(admin, id);
  if (!before) throw new Error("Promotion not found.");

  const patch: Partial<CreatePromotionInput> & { status: PromotionStatus } = {
    status: "active",
  };
  if (
    (before.status === "ended" || before.status === "expired") &&
    before.ends_at &&
    new Date(before.ends_at).getTime() <= Date.now()
  ) {
    patch.ends_at = null;
  }

  return updatePromotion(admin, id, patch, actor);
}

export async function deletePromotion(
  admin: Admin,
  id: string,
  actor?: string,
): Promise<void> {
  const before = await getPromotionById(admin, id);
  if (!before) throw new Error("Promotion not found.");

  await writeAudit(admin, id, "delete", actor, before, null);

  const { error } = await admin.from("promotions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicatePromotion(
  admin: Admin,
  id: string,
  actor?: string,
): Promise<PromotionRow> {
  const src = await getPromotionById(admin, id);
  if (!src) throw new Error("Promotion not found.");
  const created = await createPromotion(
    admin,
    {
      name: `${src.name} (Copy)`,
      slug: `${src.slug}-copy-${Date.now().toString(36)}`,
      description: src.description,
      promotion_type: src.promotion_type,
      status: "draft",
      starts_at: src.starts_at,
      ends_at: src.ends_at,
      banner_image_url: src.banner_image_url,
      landing_page_path: src.landing_page_path,
      promo_code: src.promo_code ? `${src.promo_code}COPY` : null,
      auto_apply: src.auto_apply,
      discount_type: src.discount_type,
      discount_value: src.discount_value,
      max_discount_zar: src.max_discount_zar,
      min_booking_amount_zar: src.min_booking_amount_zar,
      customer_eligibility: src.customer_eligibility,
      booking_eligibility: src.booking_eligibility,
      usage_limit_total: src.usage_limit_total,
      usage_limit_per_customer: src.usage_limit_per_customer,
      budget_zar: src.budget_zar,
      stackable: src.stackable,
      stack_priority: src.stack_priority,
      show_on_homepage: src.show_on_homepage,
      show_on_booking: src.show_on_booking,
      show_on_pricing: src.show_on_pricing,
      show_announcement_bar: src.show_announcement_bar,
      display_config: src.display_config,
    },
    actor,
  );
  await admin.from("promotions").update({ duplicated_from_id: id }).eq("id", created.id);
  return { ...created, duplicated_from_id: id };
}

async function writeAudit(
  admin: Admin,
  promotionId: string,
  action: string,
  actor: string | undefined,
  before: unknown,
  after: unknown,
) {
  await admin.from("promotion_audit_log").insert({
    promotion_id: promotionId,
    action,
    actor: actor ?? null,
    before_state: before ?? null,
    after_state: after ?? null,
  });
}

export async function loadBundlesForPromotions(
  admin: Admin,
  promotionIds: string[],
): Promise<PromotionBundleRow[]> {
  if (promotionIds.length === 0) return [];
  const { data, error } = await admin
    .from("promotion_bundles")
    .select("*")
    .in("promotion_id", promotionIds)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => ({
    id: String(b.id),
    promotion_id: String(b.promotion_id),
    name: String(b.name),
    required_service_slugs: (b.required_service_slugs as string[]) ?? [],
    required_extra_ids: (b.required_extra_ids as string[]) ?? [],
    min_services: Number(b.min_services ?? 2),
    discount_type: b.discount_type as "percent" | "fixed",
    discount_value: Number(b.discount_value),
    max_discount_zar: b.max_discount_zar != null ? Number(b.max_discount_zar) : null,
    stackable: Boolean(b.stackable),
    enabled: Boolean(b.enabled),
    sort_order: Number(b.sort_order ?? 0),
  }));
}

export async function getCompletedBookingCount(
  admin: Admin,
  userId: string | null,
  email: string,
): Promise<number> {
  if (userId) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");
    if (count != null) return count;
  }
  if (email.trim()) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .ilike("customer_email", email.trim())
      .eq("status", "completed");
    return count ?? 0;
  }
  return 0;
}

export async function getCustomerRedemptionCounts(
  admin: Admin,
  userId: string | null,
  promotionIds: string[],
): Promise<Record<string, number>> {
  if (!userId || promotionIds.length === 0) return {};
  const { data } = await admin
    .from("promotion_redemptions")
    .select("promotion_id")
    .eq("user_id", userId)
    .eq("status", "applied")
    .in("promotion_id", promotionIds);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.promotion_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Redemptions in the current UTC calendar year (for one_per_year eligibility). */
export async function getCustomerRedemptionCountsThisYear(
  admin: Admin,
  userId: string | null,
  promotionIds: string[],
): Promise<Record<string, number>> {
  if (!userId || promotionIds.length === 0) return {};
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString();
  const { data } = await admin
    .from("promotion_redemptions")
    .select("promotion_id")
    .eq("user_id", userId)
    .eq("status", "applied")
    .in("promotion_id", promotionIds)
    .gte("created_at", yearStart);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.promotion_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export async function getActiveMembershipDiscountPercent(
  admin: Admin,
  userId: string | null,
): Promise<number> {
  const ctx = await getActiveMembershipContext(admin, userId);
  return ctx.discountPercent;
}

export async function getActiveMembershipContext(
  admin: Admin,
  userId: string | null,
): Promise<{ discountPercent: number; planSlug: string | null }> {
  if (!userId) return { discountPercent: 0, planSlug: null };
  const { data: membership } = await admin
    .from("customer_memberships")
    .select("plan_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership?.plan_id) return { discountPercent: 0, planSlug: null };
  const { data: plan } = await admin
    .from("membership_plans")
    .select("discount_percent, enabled, slug")
    .eq("id", membership.plan_id)
    .maybeSingle();
  if (!plan?.enabled) return { discountPercent: 0, planSlug: null };
  return {
    discountPercent: Number(plan.discount_percent ?? 0),
    planSlug: typeof plan.slug === "string" ? plan.slug : null,
  };
}

export async function evaluateCheckoutPromotions(
  admin: Admin,
  ctx: CheckoutPromotionContext,
): Promise<PromotionEvaluationResult> {
  await syncPromotionStatuses(admin);
  const { data, error } = await admin.from("promotions").select("*").eq("status", "active");
  if (error) throw new Error(error.message);
  const promotions = (data ?? []).map((row) => mapPromotionRow(row as Record<string, unknown>));
  const bundles = await loadBundlesForPromotions(
    admin,
    promotions.filter((p) => p.promotion_type === "bundle").map((p) => p.id),
  );
  const completedBookingCount =
    ctx.completedBookingCount >= 0
      ? ctx.completedBookingCount
      : await getCompletedBookingCount(admin, ctx.userId, ctx.customerEmail);
  const membershipCtx = await getActiveMembershipContext(admin, ctx.userId);
  const membershipDiscountPercent =
    ctx.membershipDiscountPercent ?? membershipCtx.discountPercent;
  const promotionIds = promotions.map((p) => p.id);
  const [customerRedemptionCounts, customerRedemptionCountsThisYear] = await Promise.all([
    getCustomerRedemptionCounts(admin, ctx.userId, promotionIds),
    getCustomerRedemptionCountsThisYear(admin, ctx.userId, promotionIds),
  ]);

  return evaluatePromotions({
    promotions,
    bundles,
    ctx: {
      ...ctx,
      completedBookingCount,
      membershipDiscountPercent,
      membershipPlanSlug: ctx.membershipPlanSlug ?? membershipCtx.planSlug,
    },
    customerRedemptionCounts,
    customerRedemptionCountsThisYear,
  });
}

export async function recordPromotionEvent(
  admin: Admin,
  args: {
    promotionId: string;
    eventType:
      | "view"
      | "click"
      | "booking_started"
      | "booking_completed"
      | "code_applied"
      | "code_rejected"
      | "credit_issued"
      | "email_sent"
      | "sms_sent"
      | "landing_visit"
      | "qr_scan"
      | "popup_view"
      | "popup_dismiss"
      | "content_generated";
    userId?: string | null;
    bookingId?: string | null;
    sessionId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("promotion_events").insert({
    promotion_id: args.promotionId,
    event_type: args.eventType,
    user_id: args.userId ?? null,
    booking_id: args.bookingId ?? null,
    session_id: args.sessionId ?? null,
    metadata: args.metadata ?? {},
  });

  const counterMap: Partial<Record<typeof args.eventType, string>> = {
    view: "views_count",
    click: "clicks_count",
    booking_started: "bookings_started_count",
    booking_completed: "bookings_completed_count",
  };
  const col = counterMap[args.eventType];
  if (col) {
    const { data } = await admin.from("promotions").select(col).eq("id", args.promotionId).maybeSingle();
    const current = Number((data as Record<string, number> | null)?.[col] ?? 0);
    await admin
      .from("promotions")
      .update({ [col]: current + 1, updated_at: new Date().toISOString() })
      .eq("id", args.promotionId);
  }
}

export async function applyPromotionRedemptions(
  admin: Admin,
  args: {
    applied: AppliedPromotionDiscount[];
    userId: string | null;
    bookingId: string;
    customerEmail: string;
    bookingRevenueZar: number;
    idempotencyPrefix: string;
  },
): Promise<void> {
  for (const discount of args.applied) {
    if (discount.promotionId === "membership") {
      if (args.userId) {
        const { data: membership } = await admin
          .from("customer_memberships")
          .select("id, savings_to_date_zar")
          .eq("user_id", args.userId)
          .eq("status", "active")
          .maybeSingle();
        if (membership) {
          await admin
            .from("customer_memberships")
            .update({
              savings_to_date_zar: Number(membership.savings_to_date_zar ?? 0) + discount.discountZar,
              updated_at: new Date().toISOString(),
            })
            .eq("id", membership.id);
        }
      }
      continue;
    }

    const idempotencyKey = `${args.idempotencyPrefix}:${discount.promotionId}:${args.bookingId}`;
    const { error } = await admin.from("promotion_redemptions").insert({
      promotion_id: discount.promotionId,
      user_id: args.userId,
      booking_id: args.bookingId,
      customer_email: args.customerEmail,
      discount_zar: discount.discountZar,
      status: "applied",
      idempotency_key: idempotencyKey,
      metadata: {
        slug: discount.slug,
        source: discount.source,
        bundleId: discount.bundleId ?? null,
        description: discount.description,
      },
    });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    if (error) continue;

    const { data: counterRaw, error: counterErr } = await admin.rpc(
      "increment_promotion_redemption_counters",
      {
        p_promotion_id: discount.promotionId,
        p_discount_zar: discount.discountZar,
        p_revenue_zar: args.bookingRevenueZar,
      },
    );
    if (counterErr) {
      // Fallback: optimistic concurrency update if RPC not yet migrated.
      const { data: promo } = await admin
        .from("promotions")
        .select("redemptions_count, budget_spent_zar, revenue_generated_zar, budget_zar, usage_limit_total")
        .eq("id", discount.promotionId)
        .maybeSingle();
      if (promo) {
        const prevCount = Number(promo.redemptions_count ?? 0);
        const prevSpent = Number(promo.budget_spent_zar ?? 0);
        const usageLimit =
          promo.usage_limit_total == null ? null : Number(promo.usage_limit_total);
        const budgetZar = promo.budget_zar == null ? null : Number(promo.budget_zar);
        if (usageLimit != null && prevCount >= usageLimit) {
          throw new Error("Promotion usage limit reached.");
        }
        if (budgetZar != null && prevSpent + discount.discountZar > budgetZar) {
          throw new Error("Promotion budget exhausted.");
        }
        const { data: updatedRows, error: updateErr } = await admin
          .from("promotions")
          .update({
            redemptions_count: prevCount + 1,
            budget_spent_zar: prevSpent + discount.discountZar,
            revenue_generated_zar: Number(promo.revenue_generated_zar ?? 0) + args.bookingRevenueZar,
            updated_at: new Date().toISOString(),
          })
          .eq("id", discount.promotionId)
          .eq("redemptions_count", prevCount)
          .select("id");
        if (updateErr) throw new Error(updateErr.message);
        if (!updatedRows?.length) {
          throw new Error("Promotion counter race — retry checkout.");
        }
      }
    } else {
      const counter = counterRaw as { ok?: boolean; reason?: string } | null;
      if (counter && counter.ok === false) {
        throw new Error(
          counter.reason === "limit_or_budget_exceeded"
            ? "Promotion limit or budget reached."
            : `Promotion counter update failed (${counter.reason ?? "unknown"}).`,
        );
      }
    }
    await recordPromotionEvent(admin, {
      promotionId: discount.promotionId,
      eventType: "code_applied",
      userId: args.userId,
      bookingId: args.bookingId,
      metadata: { discountZar: discount.discountZar, source: discount.source },
    });
  }
}
