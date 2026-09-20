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
  isProgressiveBookingDetailsService,
  usesProgressiveIndividualSchedule,
  type BookingDetailsStage,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import {
  BOOKING_FUNNEL_ROW,
  bookingV2StepToFunnelStep,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";

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

function sanitizeStoredForm(data: Partial<BookingV2FormData>): Partial<BookingV2FormData> {
  const serviceDetails = { ...(data.serviceDetails ?? {}) };
  for (const [key, value] of Object.entries(serviceDetails)) {
    if (value === null) {
      delete serviceDetails[key];
    } else if (value === true || value === false) {
      serviceDetails[key] = value ? "yes" : "no";
    }
  }

  return {
    ...data,
    serviceDetails,
    ...(data.equipmentRequired != null
      ? { equipmentRequired: coerceYesNoValue(data.equipmentRequired) }
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
      usesProgressiveIndividualSchedule(serviceSlug) ? "booking_type" : null,
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
    const sanitized = saved ? sanitizeStoredForm(saved) : null;
    const urlPatch = bookingV2PrefillPatchFromLegacySearchParams(searchParams);
    const merged = {
      ...defaults,
      ...(sanitized ?? {}),
      ...(urlPatch.serviceDetails
        ? {
            serviceDetails: {
              ...(saved?.serviceDetails ?? defaults.serviceDetails),
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
                ...new Set([...(saved?.selectedExtras ?? defaults.selectedExtras), ...urlPatch.selectedExtras]),
              ],
            }
          : {}),
    };
    if (
      sanitized ||
      urlPatch.serviceDetails ||
      urlPatch.suburb ||
      urlPatch.selectedExtras?.length ||
      urlPatch.replaceSelectedExtras
    ) {
      form.reset(merged, { keepDefaultValues: false });
      if (isProgressiveBookingDetailsService(serviceSlug)) {
        const details = merged.serviceDetails ?? {};
        const address = {
          address: merged.address,
          suburb: merged.suburb,
          contactPhone: merged.contactPhone,
          serviceAreaLocationId: merged.serviceAreaLocationId,
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
      form.reset(patch, { keepDefaultValues: false });
      if (isProgressiveBookingDetailsService(serviceSlug)) {
        setDetailsSectionOverride(
          bookingDetailsStage(
            serviceSlug,
            patch.serviceDetails,
            {
              address: patch.address,
              suburb: patch.suburb,
              contactPhone: patch.contactPhone,
              serviceAreaLocationId: patch.serviceAreaLocationId,
            },
            config.step1Questions,
          ),
        );
      }
      writeToStorage(patch);
    })();
    return () => {
      cancelled = true;
    };
  }, [rebookId, rebookToken, serviceSlug, cleanerMode, form, router]);

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
    [form, scheduling, pricingAvailability],
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
      usesProgressiveIndividualSchedule(serviceSlug) ? "booking_type" : null,
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
