"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm, FormProvider, type UseFormReturn } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SERVICE_CONFIG,
  type ServiceSlug,
} from "@/src/features/booking-v2/config/serviceConfig";
import {
  defaultBookingFormData,
  bookingStepFromQuery,
  bookingStepQueryValue,
  type BookingV2FormData,
  type BookingStep,
} from "@/src/features/booking-v2/types";
import { coerceYesNoValue } from "@/src/features/booking-v2/components/serviceQuestionYesNo";
import type { LiveServiceConfig, ServicesCatalog } from "@/app/api/booking-v2/services/route";
import type { BookingV2FeesConfig } from "@/lib/booking-v2/types";
import type { BookingV2SchedulingConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import {
  canEnterBookingPayment,
  type BookingPricingAvailability,
} from "@/lib/booking-v2/bookingPricingAvailability";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import {
  bookingV2PrefillPatchFromLegacySearchParams,
  explicitBookServiceSlugFromParam,
} from "@/lib/booking/legacyBookingToBookRedirect";
import { setReferralCapture } from "@/lib/referrals/client";
import { consumeBookingV2CompletedReset } from "@/lib/booking-v2/bookingV2PaymentRedirect";
import { buildStep2Schema, step1Schema } from "@/src/features/booking-v2/schemas";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import type { BookingRow } from "@/lib/dashboard/types";
import { bookingServiceSlugFromBookingRow } from "@/lib/booking-v2/bookingV2ServiceSlug";
import { bookingV2FormPatchFromBookingRow } from "@/lib/booking-v2/rebookFromBookingRow";
import type { RegularCleaningScheduleStage } from "@/src/features/booking-v2/steps/regularCleaningScheduleProgressiveDisclosure";
import {
  bookingDetailsStage,
  bookingDetailsStageFromSearchParam,
  bookingDetailsStageIndex,
  bookingDetailsStageReady,
  isProgressiveBookingDetailsService,
  usesProgressiveIndividualSchedule,
  type BookingDetailsStage,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import {
  BOOKING_FUNNEL_ROW,
  bookingV2StepToFunnelStep,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import {
  verifySelectedBookingV2Cleaners,
  verifySelectedBookingV2Slot,
} from "@/lib/booking-v2/verifySelectedBookingV2Schedule";
import { recurringScheduleAllowedForService } from "@/lib/booking-v2/serviceRecurringPolicy";
import { getSession } from "@/lib/auth/authClient";

export type { LiveServiceConfig };

const STORAGE_KEY = "shalean:booking-v2:v1"; // keep in sync with BOOKING_V2_DRAFT_STORAGE_KEY

// ─── Context shape ─────────────────────────────────────────────────────────────

type BookingV2ContextValue = {
  form: UseFormReturn<BookingV2FormData>;
  currentStep: BookingStep;
  serviceSlug: ServiceSlug;
  /** Live pricing catalog fetched from DB. Falls back to serviceConfig values when null. */
  liveConfig: LiveServiceConfig | null;
  scheduling: BookingV2SchedulingConfig;
  feesConfig: BookingV2FeesConfig;
  catalogLoading: boolean;
  pricingAvailability: BookingPricingAvailability;
  detailsSectionOverride: BookingDetailsStage | null;
  editDetailsSection: (section: BookingDetailsStage) => void;
  scheduleSectionOverride: RegularCleaningScheduleStage | null;
  editScheduleSection: (section: RegularCleaningScheduleStage) => void;
  goToStep: (step: BookingStep) => void;
  goNext: () => void;
  goBack: () => void;
  canGoNext: (step: BookingStep) => Promise<boolean>;
  clearBooking: () => void;
};

const BookingV2Context = createContext<BookingV2ContextValue | null>(null);

// ─── Storage helpers ───────────────────────────────────────────────────────────

function readFromStorage(slug: ServiceSlug): Partial<BookingV2FormData> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { serviceSlug?: string } & Partial<BookingV2FormData>;
    if (parsed.serviceSlug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(data: BookingV2FormData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function sanitizeStoredForm(
  data: Partial<BookingV2FormData>,
  serviceSlug: ServiceSlug,
): Partial<BookingV2FormData> {
  const serviceDetails = { ...(data.serviceDetails ?? {}) };
  for (const [key, value] of Object.entries(serviceDetails)) {
    if (value === null) {
      delete serviceDetails[key];
    } else if (value === true || value === false) {
      serviceDetails[key] = value ? "yes" : "no";
    }
  }

  if (serviceSlug === "carpet-cleaning") {
    delete serviceDetails.sofaCount;
    delete serviceDetails.hasPets;
    delete serviceDetails.specialInstructions;
  }

  if (serviceSlug === "office-cleaning") {
    delete serviceDetails.frequency;
    delete serviceDetails.afterHours;
    delete serviceDetails.specialInstructions;
  }

  if (serviceSlug === "airbnb-cleaning") {
    delete serviceDetails.guestCheckout;
    delete serviceDetails.welcomeBasket;
    delete serviceDetails.specialInstructions;
  }

  return {
    ...data,
    serviceDetails,
    ...(data.equipmentRequired != null
      ? { equipmentRequired: coerceYesNoValue(data.equipmentRequired) }
      : {}),
    ...(serviceSlug === "carpet-cleaning"
      ? {
          bookingType: "once_off" as const,
          recurringFrequency: "" as const,
          recurringDays: [],
          recurringStartDate: "",
          recurringEndDate: "",
          cleanerCount: 1,
          selectedCleanerIds: (data.selectedCleanerIds ?? []).slice(0, 1),
          selectedCleanerDetails: (data.selectedCleanerDetails ?? []).slice(0, 1),
          selectedExtras: (data.selectedExtras ?? []).filter(
            (extraId) => extraId !== "stain-treatment",
          ),
        }
      : serviceSlug === "airbnb-cleaning"
        ? {
            bookingType: "once_off" as const,
            recurringFrequency: "" as const,
            recurringDays: [],
            recurringStartDate: "",
            recurringEndDate: "",
            equipmentRequired: "no" as const,
            equipmentQuote: null,
          }
        : {}),
  };
}

function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const DEFAULT_SCHEDULING: BookingV2SchedulingConfig = {
  leadMinutes: 120,
  slotStartHour: 8,
  slotEndHour: 12,
  slotIntervalMinutes: 30,
  timezone: "Africa/Johannesburg",
};

// ─── Provider ──────────────────────────────────────────────────────────────────

export function BookingV2Provider({
  serviceSlug,
  children,
}: {
  serviceSlug: ServiceSlug;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = SERVICE_CONFIG[serviceSlug];

  const currentStep = bookingStepFromQuery(searchParams.get("step"));
  const requestedQueryServiceSlug = explicitBookServiceSlugFromParam(
    searchParams.get("service"),
  );
  const requestedDetailsSection = bookingDetailsStageFromSearchParam(
    serviceSlug,
    searchParams.get("section"),
  );

  useEffect(() => {
    if (!requestedQueryServiceSlug || requestedQueryServiceSlug === serviceSlug) return;

    const params = new URLSearchParams(window.location.search);
    params.set("service", requestedQueryServiceSlug);
    router.replace(`/book/${requestedQueryServiceSlug}?${params.toString()}`);
  }, [requestedQueryServiceSlug, router, serviceSlug]);

  // Persist referral invitations again at booking entry. This makes the offer survive
  // account creation, email confirmation, and direct /book links even if the landing
  // page component was remounted before localStorage completed.
  useEffect(() => {
    const referralCode = searchParams.get("ref")?.trim();
    if (referralCode) setReferralCapture(referralCode, "customer");
  }, [searchParams]);

  // Live pricing catalog from DB
  const [catalog, setCatalog] = useState<ServicesCatalog | null>(null);
  const [scheduling, setScheduling] = useState<BookingV2SchedulingConfig>(DEFAULT_SCHEDULING);
  const [feesConfig, setFeesConfig] = useState<BookingV2FeesConfig>(defaultBookingV2FeesConfig());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [pricingAvailability, setPricingAvailability] =
    useState<BookingPricingAvailability>("loading");
  const [detailsSectionOverride, setDetailsSectionOverride] =
    useState<BookingDetailsStage | null>(
      isProgressiveBookingDetailsService(serviceSlug)
        ? requestedDetailsSection ?? "address"
        : null,
    );
  const [scheduleSectionOverride, setScheduleSectionOverride] =
    useState<RegularCleaningScheduleStage | null>(
      usesProgressiveIndividualSchedule(serviceSlug)
        ? serviceSlug === "carpet-cleaning" || serviceSlug === "airbnb-cleaning"
          ? "date_time"
          : "booking_type"
        : null,
    );

  useEffect(() => {
    fetch("/api/booking-v2/services")
      .then(async (r) => {
        if (!r.ok) throw new Error(`catalog_http_${r.status}`);
        return r.json() as Promise<{
          catalog?: ServicesCatalog;
          feesConfig?: BookingV2FeesConfig;
          scheduling?: BookingV2SchedulingConfig;
        }>;
      })
      .then((json) => {
        if (!json.catalog) throw new Error("catalog_missing");
        setCatalog(json.catalog);
        setPricingAvailability("available");
        if (json.feesConfig) setFeesConfig(json.feesConfig);
        if (json.scheduling) setScheduling({ ...DEFAULT_SCHEDULING, ...json.scheduling });
      })
      .catch(() => {
        setPricingAvailability("unavailable");
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  const liveConfig = catalog ? (catalog[serviceSlug] ?? null) : null;
  const cleanerMode = liveConfig?.cleanerMode ?? config.cleanerMode;

  // Always start from pure defaults so SSR and the first client render match.
  const defaults = defaultBookingFormData(serviceSlug, cleanerMode);

  const form = useForm<BookingV2FormData>({
    defaultValues: defaults,
    mode: "onTouched",
  });

  // After mount: restore persisted state, then merge marketing URL prefill (legacy /booking links).
  useEffect(() => {
    const saved = readFromStorage(serviceSlug);
    const sanitized = saved ? sanitizeStoredForm(saved, serviceSlug) : null;
    const urlPatch = bookingV2PrefillPatchFromLegacySearchParams(searchParams);
    const merged = {
      ...defaults,
      ...(sanitized ?? {}),
      ...(urlPatch.serviceDetails
        ? {
            serviceDetails: {
              ...(sanitized?.serviceDetails ?? defaults.serviceDetails),
              ...urlPatch.serviceDetails,
            },
          }
        : {}),
      ...(urlPatch.suburb ? { suburb: urlPatch.suburb } : {}),
      ...(urlPatch.replaceSelectedExtras
        ? { selectedExtras: urlPatch.selectedExtras ?? [] }
        : urlPatch.selectedExtras?.length
          ? {
              selectedExtras: [
                ...new Set([
                  ...(sanitized?.selectedExtras ?? defaults.selectedExtras),
                  ...urlPatch.selectedExtras,
                ]),
              ],
            }
          : {}),
    };
    const normalizedMerged = sanitizeStoredForm(
      merged,
      serviceSlug,
    ) as BookingV2FormData;
    if (
      sanitized ||
      urlPatch.serviceDetails ||
      urlPatch.suburb ||
      urlPatch.selectedExtras?.length ||
      urlPatch.replaceSelectedExtras
    ) {
      form.reset(normalizedMerged, { keepDefaultValues: false });
      if (isProgressiveBookingDetailsService(serviceSlug)) {
        const details = normalizedMerged.serviceDetails ?? {};
        const address = {
          address: normalizedMerged.address,
          suburb: normalizedMerged.suburb,
          contactPhone: normalizedMerged.contactPhone,
          serviceAreaLocationId: normalizedMerged.serviceAreaLocationId,
        };
        setDetailsSectionOverride(
          bookingDetailsStage(
            serviceSlug,
            details,
            address,
            config.step1Questions,
          ),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rebookId = searchParams.get("rebook")?.trim() ?? "";
  const rebookToken = searchParams.get("rt")?.trim() ?? "";
  useEffect(() => {
    if (!rebookId) return;
    let cancelled = false;
    void (async () => {
      let out: { ok: true; data: { booking?: BookingRow } } | { ok: false; status: number; error: string };

      if (rebookToken) {
        const res = await fetch(
          `/api/rebook/prefill?rebook=${encodeURIComponent(rebookId)}&rt=${encodeURIComponent(rebookToken)}`,
        );
        const j = (await res.json().catch(() => ({}))) as { booking?: BookingRow; error?: string };
        out = res.ok
          ? { ok: true, data: j }
          : { ok: false, status: res.status, error: j.error ?? res.statusText };
      } else {
        out = await dashboardFetchJson<{ booking?: BookingRow }>(
          `/api/customer/bookings/${encodeURIComponent(rebookId)}`,
        );
      }

      if (cancelled || !out.ok || !out.data.booking) return;

      const row = out.data.booking;
      const rowSlug = bookingServiceSlugFromBookingRow(row);
      if (rowSlug !== serviceSlug) {
        const redirectUrl = rebookToken
          ? `/book/${rowSlug}?rebook=${encodeURIComponent(rebookId)}&step=schedule&rt=${encodeURIComponent(rebookToken)}`
          : `/book/${rowSlug}?rebook=${encodeURIComponent(rebookId)}&step=schedule`;
        router.replace(redirectUrl);
        return;
      }

      const patch = bookingV2FormPatchFromBookingRow(row, serviceSlug, cleanerMode);
      const normalizedPatch = sanitizeStoredForm(
        patch,
        serviceSlug,
      ) as BookingV2FormData;
      if (serviceSlug === "airbnb-cleaning" && liveConfig) {
        const validExtras = new Set((liveConfig.extras ?? []).map((extra) => extra.id));
        normalizedPatch.selectedExtras = (normalizedPatch.selectedExtras ?? []).filter((id) =>
          validExtras.has(id),
        );
      }
      form.reset(normalizedPatch, { keepDefaultValues: false });
      if (isProgressiveBookingDetailsService(serviceSlug)) {
        setDetailsSectionOverride(
          bookingDetailsStage(
            serviceSlug,
            normalizedPatch.serviceDetails,
            {
              address: normalizedPatch.address,
              suburb: normalizedPatch.suburb,
              contactPhone: normalizedPatch.contactPhone,
              serviceAreaLocationId: normalizedPatch.serviceAreaLocationId,
            },
            config.step1Questions,
          ),
        );
      }
      writeToStorage(normalizedPatch);
    })();
    return () => {
      cancelled = true;
    };
  }, [rebookId, rebookToken, serviceSlug, cleanerMode, form, router, liveConfig]);

  // Persist to localStorage whenever form changes
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        writeToStorage(values as BookingV2FormData);
      }, 300);
    });
    return () => {
      subscription.unsubscribe();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [form]);

  /**
   * A pending-payment booking owns a frozen server price and Paystack session.
   * Once the customer leaves Payment and edits the draft, expire that old
   * pending payment before allowing live pricing to resume. This prevents a
   * stale Paystack amount/reference from surviving a changed booking.
   */
  const pendingPaymentInvalidationRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentStep === 4) return;

    const systemOnlyFields = new Set([
      "pendingBookingId",
      "pricingSummary",
      "quoteLock",
    ]);

    const subscription = form.watch((_values, info) => {
      const fieldName = info.name ?? "";
      if (!fieldName || systemOnlyFields.has(fieldName)) return;

      const pendingBookingId = form.getValues("pendingBookingId")?.trim() ?? "";
      if (!pendingBookingId || pendingPaymentInvalidationRef.current === pendingBookingId) return;
      pendingPaymentInvalidationRef.current = pendingBookingId;

      void (async () => {
        try {
          const session = await getSession();
          if (!session?.access_token) {
            pendingPaymentInvalidationRef.current = null;
            return;
          }

          const response = await fetch(
            `/api/bookings/${encodeURIComponent(pendingBookingId)}/abandon-payment`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: "no-store",
            },
          );

          if (!response.ok) {
            pendingPaymentInvalidationRef.current = null;
            return;
          }

          // Clear only after the server has made the old Paystack booking
          // non-payable. The pricing hook will then immediately requote the
          // customer's current edited scope and obtain a fresh quote lock.
          if (form.getValues("pendingBookingId")?.trim() === pendingBookingId) {
            form.setValue("pendingBookingId", null, {
              shouldDirty: false,
              shouldValidate: false,
            });
            form.setValue("quoteLock", null, {
              shouldDirty: false,
              shouldValidate: false,
            });
          }
        } catch {
          pendingPaymentInvalidationRef.current = null;
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, [currentStep, form]);

  /** When service area changes, drop incompatible schedule / cleaner / team selections. */
  const prevLocationIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const subscription = form.watch((values, info) => {
      if (info.name && info.name !== "serviceAreaLocationId" && info.name !== "suburb") return;
      const nextId = (values.serviceAreaLocationId ?? "").trim();
      const prev = prevLocationIdRef.current;
      if (prev === undefined) {
        prevLocationIdRef.current = nextId;
        return;
      }
      if (prev === nextId) return;
      prevLocationIdRef.current = nextId;
      form.setValue("date", "", { shouldDirty: true });
      form.setValue("time", "", { shouldDirty: true });
      form.setValue("alternativeDate", "", { shouldDirty: true });
      form.setValue("alternativeTime", "", { shouldDirty: true });
      form.setValue("selectedCleanerIds", [], { shouldDirty: true });
      form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
      form.setValue("assignedTeamId", "", { shouldDirty: true });
      form.setValue("assignedTeamName", "", { shouldDirty: true });
    });
    return () => subscription.unsubscribe();
  }, [form]);

  /** Regular, Deep and Moving scope edits invalidate previous slot / cleaner / team checks. */
  const prevCoreServiceScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      serviceSlug !== "regular-cleaning" &&
      serviceSlug !== "deep-cleaning" &&
      serviceSlug !== "moving-cleaning"
    ) {
      return;
    }

    function scopeFingerprint(
      details: Record<string, string | number | boolean>,
      extras: readonly string[],
    ): string {
      const common = [
        String(details.bedrooms ?? ""),
        String(details.bathrooms ?? ""),
        String(details.extraRooms ?? ""),
      ];
      if (serviceSlug === "deep-cleaning") {
        common.push(String(details.lastCleaned ?? ""));
      }
      if (serviceSlug === "moving-cleaning") {
        common.push(
          String(details.moveType ?? ""),
          String(details.furnished ?? ""),
        );
      }
      common.push([...extras].sort().join(","));
      return common.join("|");
    }

    const currentDetails = form.getValues("serviceDetails") ?? {};
    const currentExtras = form.getValues("selectedExtras") ?? [];
    prevCoreServiceScopeRef.current = scopeFingerprint(currentDetails, currentExtras);

    const watchedNames = new Set([
      "serviceDetails.bedrooms",
      "serviceDetails.bathrooms",
      "serviceDetails.extraRooms",
      "selectedExtras",
      ...(serviceSlug === "deep-cleaning" ? ["serviceDetails.lastCleaned"] : []),
      ...(serviceSlug === "moving-cleaning"
        ? ["serviceDetails.moveType", "serviceDetails.furnished"]
        : []),
    ]);

    const subscription = form.watch((values, info) => {
      if (info.name && !watchedNames.has(info.name)) return;
      const details = values.serviceDetails ?? {};
      const extras = values.selectedExtras ?? [];
      const nextScope = scopeFingerprint(
        details as Record<string, string | number | boolean>,
        extras,
      );
      const prevScope = prevCoreServiceScopeRef.current;
      if (prevScope == null || nextScope === prevScope) {
        prevCoreServiceScopeRef.current = nextScope;
        return;
      }
      prevCoreServiceScopeRef.current = nextScope;
      form.setValue("time", "", { shouldDirty: true });
      form.setValue("alternativeTime", "", { shouldDirty: true });
      form.setValue("selectedCleanerIds", [], { shouldDirty: true });
      form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
      form.setValue("assignedTeamId", "", { shouldDirty: true });
      form.setValue("assignedTeamName", "", { shouldDirty: true });
      setScheduleSectionOverride("date_time");
    });
    return () => subscription.unsubscribe();
  }, [form, serviceSlug]);

  /** Office size/bathroom edits change job duration, so previous slot/cleaner checks are stale. */
  const prevOfficeScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (serviceSlug !== "office-cleaning") return;

    const currentDetails = form.getValues("serviceDetails") ?? {};
    prevOfficeScopeRef.current = `${String(currentDetails.officeSize ?? "")}|${String(
      currentDetails.bathrooms ?? "",
    )}`;

    const subscription = form.watch((values, info) => {
      if (
        info.name &&
        info.name !== "serviceDetails.officeSize" &&
        info.name !== "serviceDetails.bathrooms"
      ) {
        return;
      }
      const details = values.serviceDetails ?? {};
      const nextScope = `${String(details.officeSize ?? "")}|${String(details.bathrooms ?? "")}`;
      const prevScope = prevOfficeScopeRef.current;
      if (prevScope == null || nextScope === prevScope) {
        prevOfficeScopeRef.current = nextScope;
        return;
      }
      prevOfficeScopeRef.current = nextScope;
      form.setValue("date", "", { shouldDirty: true });
      form.setValue("time", "", { shouldDirty: true });
      form.setValue("alternativeDate", "", { shouldDirty: true });
      form.setValue("alternativeTime", "", { shouldDirty: true });
      form.setValue("selectedCleanerIds", [], { shouldDirty: true });
      form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
      form.setValue("assignedTeamId", "", { shouldDirty: true });
      form.setValue("assignedTeamName", "", { shouldDirty: true });
    });
    return () => subscription.unsubscribe();
  }, [form, serviceSlug]);

  /** Carpet room/rug counts and duration-affecting extras invalidate slot/specialist checks. */
  const prevCarpetScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (serviceSlug !== "carpet-cleaning") return;

    const currentDetails = form.getValues("serviceDetails") ?? {};
    const currentExtras = form.getValues("selectedExtras") ?? [];
    prevCarpetScopeRef.current = [
      String(currentDetails.carpetRooms ?? ""),
      String(currentDetails.rugCount ?? ""),
      [...currentExtras].sort().join(","),
    ].join("|");

    const subscription = form.watch((values, info) => {
      if (
        info.name &&
        info.name !== "serviceDetails.carpetRooms" &&
        info.name !== "serviceDetails.rugCount" &&
        info.name !== "selectedExtras"
      ) {
        return;
      }
      const details = values.serviceDetails ?? {};
      const extras = values.selectedExtras ?? [];
      const nextScope = [
        String(details.carpetRooms ?? ""),
        String(details.rugCount ?? ""),
        [...extras].sort().join(","),
      ].join("|");
      const prevScope = prevCarpetScopeRef.current;
      if (prevScope == null || nextScope === prevScope) {
        prevCarpetScopeRef.current = nextScope;
        return;
      }
      prevCarpetScopeRef.current = nextScope;
      form.setValue("time", "", { shouldDirty: true });
      form.setValue("alternativeTime", "", { shouldDirty: true });
      form.setValue("selectedCleanerIds", [], { shouldDirty: true });
      form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
    });
    return () => subscription.unsubscribe();
  }, [form, serviceSlug]);

  /** Reconcile old Airbnb drafts against the current authoritative extras catalog. */
  useEffect(() => {
    if (serviceSlug !== "airbnb-cleaning" || !liveConfig) return;
    const validExtras = new Set((liveConfig.extras ?? []).map((extra) => extra.id));
    const current = form.getValues("selectedExtras") ?? [];
    const pruned = current.filter((id) => validExtras.has(id));
    if (pruned.length !== current.length) {
      form.setValue("selectedExtras", pruned, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [form, liveConfig, serviceSlug]);

  /** Airbnb room/extras changes alter duration, so old slot/cleaner checks become stale. */
  const prevAirbnbScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (serviceSlug !== "airbnb-cleaning") return;

    const currentDetails = form.getValues("serviceDetails") ?? {};
    const currentExtras = form.getValues("selectedExtras") ?? [];
    prevAirbnbScopeRef.current = [
      String(currentDetails.bedrooms ?? ""),
      String(currentDetails.bathrooms ?? ""),
      String(currentDetails.extraRooms ?? "0"),
      [...currentExtras].sort().join(","),
    ].join("|");

    const subscription = form.watch((values, info) => {
      if (
        info.name &&
        info.name !== "serviceDetails.bedrooms" &&
        info.name !== "serviceDetails.bathrooms" &&
        info.name !== "serviceDetails.extraRooms" &&
        info.name !== "selectedExtras"
      ) {
        return;
      }
      const details = values.serviceDetails ?? {};
      const extras = values.selectedExtras ?? [];
      const nextScope = [
        String(details.bedrooms ?? ""),
        String(details.bathrooms ?? ""),
        String(details.extraRooms ?? "0"),
        [...extras].sort().join(","),
      ].join("|");
      const prevScope = prevAirbnbScopeRef.current;
      if (prevScope == null || nextScope === prevScope) {
        prevAirbnbScopeRef.current = nextScope;
        return;
      }
      prevAirbnbScopeRef.current = nextScope;
      form.setValue("time", "", { shouldDirty: true });
      form.setValue("alternativeTime", "", { shouldDirty: true });
      form.setValue("selectedCleanerIds", [], { shouldDirty: true });
      form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
      setScheduleSectionOverride("date_time");
    });
    return () => subscription.unsubscribe();
  }, [form, serviceSlug]);

  const canGoNext = useCallback(
    async (step: BookingStep): Promise<boolean> => {
      if (step === 3) {
        const hasPendingBooking = Boolean(form.getValues("pendingBookingId")?.trim());
        if (!canEnterBookingPayment(pricingAvailability, hasPendingBooking)) {
          trackBookingFunnelEvent(bookingV2StepToFunnelStep(step), BOOKING_FUNNEL_ROW.ERROR, {
            flow: "booking_v2",
            step,
            reason: "pricing_unavailable",
          });
          return false;
        }

        if (
          !hasPendingBooking &&
          (
            serviceSlug === "regular-cleaning" ||
            serviceSlug === "deep-cleaning" ||
            serviceSlug === "moving-cleaning"
          )
        ) {
          const values = form.getValues();
          const bookingDetails = {
            address: values.address,
            suburb: values.suburb,
            contactPhone: values.contactPhone,
            serviceAreaLocationId: values.serviceAreaLocationId,
          };
          const questions = liveConfig?.step1Questions ?? config.step1Questions;
          const stages =
            serviceSlug === "regular-cleaning"
              ? (["address", "property", "rooms", "pets", "equipment"] as const)
              : serviceSlug === "deep-cleaning"
                ? (["address", "property", "rooms", "pets"] as const)
                : (["address", "property", "move", "rooms", "condition"] as const);
          const firstInvalidStage = stages.find(
            (stage) =>
              !bookingDetailsStageReady(
                serviceSlug,
                stage,
                values.serviceDetails ?? {},
                bookingDetails,
                questions,
              ),
          );
          if (firstInvalidStage) {
            setDetailsSectionOverride(firstInvalidStage);
            const params = new URLSearchParams(window.location.search);
            params.set("step", "details");
            params.set("section", firstInvalidStage);
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          const scheduleResult = buildStep2Schema(scheduling).safeParse(values);
          if (!scheduleResult.success) {
            scheduleResult.error.errors.forEach((e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.setError(e.path.join(".") as any, { message: e.message });
            });
            const paths = scheduleResult.error.errors.map((e) => e.path[0]);
            const targetStage: RegularCleaningScheduleStage =
              paths.includes("bookingType") || paths.includes("recurringFrequency")
                ? "booking_type"
                : paths.includes("date") || paths.includes("time")
                  ? "date_time"
                  : "cleaner";
            setScheduleSectionOverride(targetStage);
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          if (
            !recurringScheduleAllowedForService({
              serviceSlug,
              bookingType: values.bookingType,
              recurringFrequency: values.recurringFrequency,
              recurringDays: values.recurringDays ?? [],
            })
          ) {
            form.setError("recurringFrequency", {
              message: "Choose a recurring option supported for this service.",
            });
            setScheduleSectionOverride("booking_type");
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          const durationMinutes = Math.round(
            values.pricingSummary?.team_scaled_duration_minutes ??
              values.pricingSummary?.estimated_duration_minutes ??
              (liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours) * 60,
          );
          const verificationInput = {
            date: values.date,
            time: values.time,
            locationId: values.serviceAreaLocationId.trim(),
            serviceSlug,
            serviceDetails: values.serviceDetails ?? {},
            selectedExtras: values.selectedExtras ?? [],
            durationMinutes,
          };
          const slotStillAvailable = await verifySelectedBookingV2Slot(verificationInput);
          if (!slotStillAvailable) {
            form.setError("time", {
              message: "Reconfirm an available time before payment.",
            });
            setScheduleSectionOverride("date_time");
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          const selectedCleanerIds = values.selectedCleanerIds ?? [];
          if (values.cleanerMode === "individual_cleaners" && selectedCleanerIds.length > 0) {
            const cleanersStillAvailable = await verifySelectedBookingV2Cleaners({
              ...verificationInput,
              selectedCleanerIds,
            });
            if (!cleanersStillAvailable) {
              form.setValue("selectedCleanerIds", [], { shouldDirty: true });
              form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
              setScheduleSectionOverride("cleaner");
              const params = new URLSearchParams(window.location.search);
              params.set("step", "schedule");
              params.delete("section");
              window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
              return false;
            }
          }
        }

        if (serviceSlug === "office-cleaning") {
          const values = form.getValues();
          const officeDetailsReady = bookingDetailsStageReady(
            serviceSlug,
            "rooms",
            values.serviceDetails ?? {},
            {
              address: values.address,
              suburb: values.suburb,
              contactPhone: values.contactPhone,
              serviceAreaLocationId: values.serviceAreaLocationId,
            },
            liveConfig?.step1Questions ?? config.step1Questions,
          );
          if (!officeDetailsReady) {
            setDetailsSectionOverride("rooms");
            const params = new URLSearchParams(window.location.search);
            params.set("step", "details");
            params.set("section", "rooms");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          const scheduleResult = buildStep2Schema(scheduling).safeParse(values);
          if (!scheduleResult.success) {
            scheduleResult.error.errors.forEach((e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.setError(e.path.join(".") as any, { message: e.message });
            });
            const paths = scheduleResult.error.errors.map((e) => e.path[0]);
            const targetStage: RegularCleaningScheduleStage =
              paths.includes("bookingType") || paths.includes("recurringFrequency")
                ? "booking_type"
                : paths.includes("date") || paths.includes("time")
                  ? "date_time"
                  : "cleaner";
            setScheduleSectionOverride(targetStage);
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }
        }

        if (serviceSlug === "carpet-cleaning") {
          const values = form.getValues();
          const bookingDetails = {
            address: values.address,
            suburb: values.suburb,
            contactPhone: values.contactPhone,
            serviceAreaLocationId: values.serviceAreaLocationId,
          };
          const questions = liveConfig?.step1Questions ?? config.step1Questions;
          const stages = ["property", "rooms", "condition"] as const;
          const firstInvalidStage = stages.find(
            (stage) =>
              !bookingDetailsStageReady(
                serviceSlug,
                stage,
                values.serviceDetails ?? {},
                bookingDetails,
                questions,
              ),
          );
          if (firstInvalidStage) {
            setDetailsSectionOverride(firstInvalidStage);
            const params = new URLSearchParams(window.location.search);
            params.set("step", "details");
            params.set("section", firstInvalidStage);
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          if (
            values.bookingType !== "once_off" ||
            values.cleanerCount !== 1 ||
            (values.selectedCleanerIds ?? []).length > 1
          ) {
            setScheduleSectionOverride("cleaner");
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }

          const scheduleResult = buildStep2Schema(scheduling).safeParse(values);
          if (!scheduleResult.success) {
            scheduleResult.error.errors.forEach((e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.setError(e.path.join(".") as any, { message: e.message });
            });
            const paths = scheduleResult.error.errors.map((e) => e.path[0]);
            const targetStage: RegularCleaningScheduleStage =
              paths.includes("date") || paths.includes("time") ? "date_time" : "cleaner";
            setScheduleSectionOverride(targetStage);
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }
        }
      }

      if (step === 3 && serviceSlug === "airbnb-cleaning") {
        const values = form.getValues();
        const bookingDetails = {
          address: values.address,
          suburb: values.suburb,
          contactPhone: values.contactPhone,
          serviceAreaLocationId: values.serviceAreaLocationId,
          gateCode: values.gateCode,
          accessInstructions: values.accessInstructions,
        };
        const questions = liveConfig?.step1Questions ?? config.step1Questions;
        const stages = ["property", "rooms", "turnover"] as const;
        const firstInvalidStage = stages.find(
          (stage) =>
            !bookingDetailsStageReady(
              serviceSlug,
              stage,
              values.serviceDetails ?? {},
              bookingDetails,
              questions,
            ),
        );
        if (firstInvalidStage) {
          setDetailsSectionOverride(firstInvalidStage);
          const params = new URLSearchParams(window.location.search);
          params.set("step", "details");
          params.set("section", firstInvalidStage);
          window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
          return false;
        }

        const selectedCleanerIds = values.selectedCleanerIds ?? [];
        if (
          values.bookingType !== "once_off" ||
          values.cleanerCount < 1 ||
          values.cleanerCount > 3 ||
          selectedCleanerIds.length > values.cleanerCount
        ) {
          setScheduleSectionOverride("cleaner");
          const params = new URLSearchParams(window.location.search);
          params.set("step", "schedule");
          params.delete("section");
          window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
          return false;
        }

        const scheduleResult = buildStep2Schema(scheduling).safeParse(values);
        if (!scheduleResult.success) {
          scheduleResult.error.errors.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setError(e.path.join(".") as any, { message: e.message });
          });
          const paths = scheduleResult.error.errors.map((e) => e.path[0]);
          const targetStage: RegularCleaningScheduleStage =
            paths.includes("date") || paths.includes("time") ? "date_time" : "cleaner";
          setScheduleSectionOverride(targetStage);
          const params = new URLSearchParams(window.location.search);
          params.set("step", "schedule");
          params.delete("section");
          window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
          return false;
        }

        const durationMinutes = Math.round(
          values.pricingSummary?.team_scaled_duration_minutes ??
            values.pricingSummary?.estimated_duration_minutes ??
            (liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours) * 60,
        );
        const verificationInput = {
          date: values.date,
          time: values.time,
          locationId: values.serviceAreaLocationId.trim(),
          serviceSlug,
          serviceDetails: values.serviceDetails ?? {},
          selectedExtras: values.selectedExtras ?? [],
          durationMinutes,
        };
        const slotStillAvailable = await verifySelectedBookingV2Slot(verificationInput);
        if (!slotStillAvailable) {
          form.setError("time", {
            message: "Reconfirm an available turnover time before payment.",
          });
          setScheduleSectionOverride("date_time");
          const params = new URLSearchParams(window.location.search);
          params.set("step", "schedule");
          params.delete("section");
          window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
          return false;
        }

        if (selectedCleanerIds.length > 0) {
          const cleanersStillAvailable = await verifySelectedBookingV2Cleaners({
            ...verificationInput,
            selectedCleanerIds,
          });
          if (!cleanersStillAvailable) {
            form.setValue("selectedCleanerIds", [], { shouldDirty: true });
            form.setValue("selectedCleanerDetails", [], { shouldDirty: true });
            setScheduleSectionOverride("cleaner");
            const params = new URLSearchParams(window.location.search);
            params.set("step", "schedule");
            params.delete("section");
            window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
            return false;
          }
        }
      }
      if (step === 1) {
        const values = form.getValues();
        const result = step1Schema.safeParse(values);
        if (!result.success) {
          result.error.errors.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setError(e.path.join(".") as any, { message: e.message });
          });
          trackBookingFunnelEvent(bookingV2StepToFunnelStep(step), BOOKING_FUNNEL_ROW.ERROR, {
            flow: "booking_v2",
            step,
            reason: "validation",
            fields: result.error.errors.map((e) => e.path.join(".")),
          });
          return false;
        }

        return true;
      }
      if (step === 2) {
        const values = form.getValues();
        const result = buildStep2Schema(scheduling).safeParse(values);
        if (!result.success) {
          result.error.errors.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setError(e.path.join(".") as any, { message: e.message });
          });
          trackBookingFunnelEvent(bookingV2StepToFunnelStep(step), BOOKING_FUNNEL_ROW.ERROR, {
            flow: "booking_v2",
            step,
            reason: "validation",
            fields: result.error.errors.map((e) => e.path.join(".")),
          });
          return false;
        }
        return true;
      }
      return true;
    },
    [
      form,
      scheduling,
      pricingAvailability,
      serviceSlug,
      liveConfig,
      config.step1Questions,
    ],
  );

  const goToStep = useCallback(
    (step: BookingStep) => {
      if (step === 4) {
        const hasPendingBooking = Boolean(form.getValues("pendingBookingId")?.trim());
        if (!canEnterBookingPayment(pricingAvailability, hasPendingBooking)) return;
      }
      const params = new URLSearchParams(window.location.search);
      params.set("step", bookingStepQueryValue(step));
      if (step === 1) {
        if (detailsSectionOverride) params.set("section", detailsSectionOverride);
      } else {
        params.delete("section");
      }
      // The service page is already mounted; only the client-owned step changes.
      // Native history is integrated with the Next.js App Router and avoids an
      // unnecessary RSC request for every Continue/Back/Edit click.
      window.history.pushState(null, "", `/book/${serviceSlug}?${params.toString()}`);
    },
    [detailsSectionOverride, serviceSlug, pricingAvailability, form],
  );

  const goNext = useCallback(async () => {
    const ok = await canGoNext(currentStep);
    if (!ok) return;
    if (currentStep < 4) goToStep((currentStep + 1) as BookingStep);
  }, [canGoNext, currentStep, goToStep]);

  const goBack = useCallback(() => {
    if (currentStep > 1) goToStep((currentStep - 1) as BookingStep);
    else router.push("/book");
  }, [currentStep, goToStep, router]);

  /** Deep-link / stale draft guard: Step 2+ requires a resolved service area. */
  useEffect(() => {
    if (currentStep < 2) return;
    const locationId = form.getValues("serviceAreaLocationId")?.trim() ?? "";
    const uuidOk =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        locationId,
      );
    if (!uuidOk) {
      goToStep(1);
    }
  }, [currentStep, form, goToStep]);

  const clearBooking = useCallback(() => {
    clearStorage();
    form.reset(defaultBookingFormData(serviceSlug, cleanerMode));
    setDetailsSectionOverride(
      isProgressiveBookingDetailsService(serviceSlug) ? "address" : null,
    );
    setScheduleSectionOverride(
      usesProgressiveIndividualSchedule(serviceSlug)
        ? serviceSlug === "carpet-cleaning" || serviceSlug === "airbnb-cleaning"
          ? "date_time"
          : "booking_type"
        : null,
    );
  }, [form, serviceSlug, cleanerMode]);

  const resetCompletedBooking = useCallback(() => {
    if (!consumeBookingV2CompletedReset()) return;
    clearBooking();
    const params = new URLSearchParams({
      service: serviceSlug,
      step: "details",
    });
    if (isProgressiveBookingDetailsService(serviceSlug)) {
      params.set("section", "address");
    }
    window.history.replaceState(null, "", `/book/${serviceSlug}?${params.toString()}`);
  }, [clearBooking, serviceSlug]);

  useEffect(() => {
    resetCompletedBooking();
    window.addEventListener("pageshow", resetCompletedBooking);
    return () => window.removeEventListener("pageshow", resetCompletedBooking);
  }, [resetCompletedBooking]);

  const editDetailsSection = useCallback(
    (section: BookingDetailsStage) => {
      setDetailsSectionOverride(section);
      const params = new URLSearchParams(window.location.search);
      params.set("step", "details");
      params.set("section", section);
      window.history.replaceState(null, "", `/book/${serviceSlug}?${params.toString()}`);
    },
    [serviceSlug],
  );

  useEffect(() => {
    if (
      currentStep !== 1 ||
      (serviceSlug !== "regular-cleaning" && serviceSlug !== "deep-cleaning")
    ) return;

    if (!requestedDetailsSection) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", "details");
      params.set("section", detailsSectionOverride ?? "address");
      window.history.replaceState(null, "", `/book/${serviceSlug}?${params.toString()}`);
      return;
    }

    if (requestedDetailsSection !== detailsSectionOverride) {
      setDetailsSectionOverride(requestedDetailsSection);
    }
  }, [
    currentStep,
    detailsSectionOverride,
    requestedDetailsSection,
    searchParams,
    serviceSlug,
  ]);

  useEffect(() => {
    if (
      currentStep !== 1 ||
      serviceSlug === "regular-cleaning" ||
      serviceSlug === "deep-cleaning" ||
      !isProgressiveBookingDetailsService(serviceSlug)
    ) return;

    const values = form.getValues();
    const bookingDetails = {
      address: values.address,
      suburb: values.suburb,
      contactPhone: values.contactPhone,
      serviceAreaLocationId: values.serviceAreaLocationId,
      gateCode: values.gateCode,
      accessInstructions: values.accessInstructions,
    };
    const questions = liveConfig?.step1Questions ?? config.step1Questions;
    const derivedStage = bookingDetailsStage(
      serviceSlug,
      values.serviceDetails,
      bookingDetails,
      questions,
    );

    let safeStage = requestedDetailsSection ?? detailsSectionOverride ?? derivedStage;
    if (
      requestedDetailsSection &&
      bookingDetailsStageIndex(serviceSlug, requestedDetailsSection) >
        bookingDetailsStageIndex(serviceSlug, derivedStage)
    ) {
      safeStage = derivedStage;
    }

    if (safeStage !== detailsSectionOverride) {
      setDetailsSectionOverride(safeStage);
    }

    if (!requestedDetailsSection || safeStage !== requestedDetailsSection) {
      const params = new URLSearchParams(window.location.search);
      params.set("step", "details");
      params.set("section", safeStage);
      window.history.replaceState(null, "", `/book/${serviceSlug}?${params.toString()}`);
    }
  }, [
    config.step1Questions,
    currentStep,
    form,
    liveConfig,
    requestedDetailsSection,
    serviceSlug,
  ]);

  const editScheduleSection = useCallback((section: RegularCleaningScheduleStage) => {
    setScheduleSectionOverride(section);
  }, []);

  useEffect(() => {
    if (
      currentStep !== 1 ||
      !isProgressiveBookingDetailsService(serviceSlug) ||
      detailsSectionOverride !== null
    ) return;
    const values = form.getValues();
    const bookingDetails = {
      address: values.address,
      suburb: values.suburb,
      contactPhone: values.contactPhone,
      serviceAreaLocationId: values.serviceAreaLocationId,
    };
    setDetailsSectionOverride(
      bookingDetailsStage(
        serviceSlug,
        values.serviceDetails,
        bookingDetails,
        liveConfig?.step1Questions ?? config.step1Questions,
      ),
    );
  }, [
    config.step1Questions,
    currentStep,
    detailsSectionOverride,
    form,
    liveConfig,
    serviceSlug,
  ]);

  const value = useMemo<BookingV2ContextValue>(
    () => ({
      form,
      currentStep,
      serviceSlug,
      liveConfig,
      scheduling,
      feesConfig,
      catalogLoading,
      pricingAvailability,
      detailsSectionOverride,
      editDetailsSection,
      scheduleSectionOverride,
      editScheduleSection,
      goToStep,
      goNext,
      goBack,
      canGoNext,
      clearBooking,
    }),
    [
      form,
      currentStep,
      serviceSlug,
      liveConfig,
      scheduling,
      feesConfig,
      catalogLoading,
      pricingAvailability,
      detailsSectionOverride,
      editDetailsSection,
      scheduleSectionOverride,
      editScheduleSection,
      goToStep,
      goNext,
      goBack,
      canGoNext,
      clearBooking,
    ],
  );

  if (requestedQueryServiceSlug && requestedQueryServiceSlug !== serviceSlug) {
    return null;
  }

  return (
    <BookingV2Context.Provider value={value}>
      <FormProvider {...form}>{children}</FormProvider>
    </BookingV2Context.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useBookingV2(): BookingV2ContextValue {
  const ctx = useContext(BookingV2Context);
  if (!ctx) throw new Error("useBookingV2 must be used inside <BookingV2Provider>");
  return ctx;
}
