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
import { defaultBookingFormData } from "@/lib/booking/defaultForm";
import { calculateDisplayPricing } from "@/lib/booking/displayPricing";
import {
  clearBookingDraft,
  loadBookingDraft,
  saveBookingDraft,
} from "@/lib/booking/persist";
import {
  defaultCleanerMode,
  isServiceSlug,
  type ServiceSlug,
} from "@/lib/booking/serviceMeta";
import type { BookingFormData } from "@/lib/booking/types";
import { useBookingServices } from "@/features/booking/hooks/useBookingServices";
import { useCustomerProfile } from "@/hooks/useCustomerAccount";
import type {
  BookingV2FeesConfig,
  BookingV2SchedulingConfig,
  LiveServiceConfig,
} from "@/services/types/bookingV2";

type BookingWizardContextValue = {
  form: BookingFormData;
  patchForm: (patch: Partial<BookingFormData>) => void;
  setForm: (next: BookingFormData | ((prev: BookingFormData) => BookingFormData)) => void;
  startService: (slug: ServiceSlug) => void;
  clearDraft: () => Promise<void>;
  liveConfig: LiveServiceConfig | null;
  feesConfig: BookingV2FeesConfig | null;
  scheduling: BookingV2SchedulingConfig | null;
  catalogLoading: boolean;
  catalogError: Error | null;
  refetchCatalog: () => void;
  hydrated: boolean;
};

const BookingWizardContext = createContext<BookingWizardContextValue | null>(null);

export function BookingWizardProvider({ children }: { children: ReactNode }) {
  const catalogQuery = useBookingServices();
  const profileQuery = useCustomerProfile();
  const vipTier = profileQuery.data?.tier?.trim() || "regular";
  const [form, setFormState] = useState<BookingFormData>(() =>
    defaultBookingFormData("regular-cleaning"),
  );
  const [hydrated, setHydrated] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadBookingDraft();
      if (!cancelled && draft) {
        setFormState(draft);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveConfig = useMemo(() => {
    const slug = form.serviceSlug;
    return catalogQuery.data?.catalog?.[slug] ?? null;
  }, [catalogQuery.data, form.serviceSlug]);

  const feesConfig = catalogQuery.data?.feesConfig ?? null;
  const scheduling = catalogQuery.data?.scheduling ?? null;

  // Recompute display pricing whenever inputs / catalog change
  useEffect(() => {
    if (!liveConfig || !feesConfig) return;
    const breakdown = calculateDisplayPricing({
      serviceSlug: form.serviceSlug,
      serviceLabel: liveConfig.label,
      serviceDetails: form.serviceDetails,
      selectedExtras: form.selectedExtras,
      cleanerMode: form.cleanerMode,
      cleanerCount: form.cleanerCount,
      bookingType: form.bookingType,
      recurringFrequency: form.recurringFrequency || "",
      catalog: liveConfig,
      feesConfig,
      equipmentRequired: form.equipmentRequired === "yes",
      equipmentQuote: form.equipmentQuote,
      vipTier,
    });
    setFormState((prev) => {
      const prevTotal = prev.pricingSummary.estimated_total;
      if (
        prevTotal === breakdown.estimated_total &&
        prev.pricingSummary.service_fee === breakdown.service_fee &&
        prev.pricingSummary.selected_extras_total === breakdown.selected_extras_total &&
        prev.pricingSummary.equipment_logistics_fee === breakdown.equipment_logistics_fee &&
        prev.pricingSummary.extra_cleaner_cost === breakdown.extra_cleaner_cost &&
        prev.pricingSummary.estimated_duration_minutes === breakdown.estimated_duration_minutes &&
        (prev.pricingSummary.vip_discount_zar ?? 0) === (breakdown.vip_discount_zar ?? 0)
      ) {
        return prev;
      }
      return { ...prev, pricingSummary: breakdown };
    });
  }, [
    liveConfig,
    feesConfig,
    vipTier,
    form.serviceSlug,
    form.serviceDetails,
    form.selectedExtras,
    form.cleanerMode,
    form.cleanerCount,
    form.bookingType,
    form.recurringFrequency,
    form.equipmentRequired,
    form.equipmentQuote,
  ]);

  // Persist draft (debounced)
  useEffect(() => {
    if (!hydrated) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void saveBookingDraft(form);
    }, 400);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [form, hydrated]);

  // Sync cleanerMode from live catalog when service changes
  useEffect(() => {
    if (!liveConfig) return;
    const mode = liveConfig.cleanerMode ?? defaultCleanerMode(form.serviceSlug);
    setFormState((prev) => {
      if (prev.cleanerMode === mode) return prev;
      return {
        ...prev,
        cleanerMode: mode,
        assignedTeamId: mode === "team" ? prev.assignedTeamId : "",
        assignedTeamName: mode === "team" ? prev.assignedTeamName : "",
        selectedCleanerIds: mode === "individual_cleaners" ? prev.selectedCleanerIds : [],
        selectedCleanerDetails:
          mode === "individual_cleaners" ? prev.selectedCleanerDetails : [],
      };
    });
  }, [liveConfig, form.serviceSlug]);

  const setForm = useCallback(
    (next: BookingFormData | ((prev: BookingFormData) => BookingFormData)) => {
      setFormState(next);
    },
    [],
  );

  const patchForm = useCallback((patch: Partial<BookingFormData>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
  }, []);

  const startService = useCallback((slug: ServiceSlug) => {
    if (!isServiceSlug(slug)) return;
    setFormState((prev) => {
      if (prev.serviceSlug === slug && (prev.address || prev.suburb || prev.date)) {
        return { ...prev, serviceSlug: slug };
      }
      return defaultBookingFormData(slug);
    });
  }, []);

  const clearDraft = useCallback(async () => {
    await clearBookingDraft();
    setFormState(defaultBookingFormData("regular-cleaning"));
  }, []);

  const value = useMemo<BookingWizardContextValue>(
    () => ({
      form,
      patchForm,
      setForm,
      startService,
      clearDraft,
      liveConfig,
      feesConfig,
      scheduling,
      catalogLoading: catalogQuery.isLoading,
      catalogError: catalogQuery.error instanceof Error ? catalogQuery.error : null,
      refetchCatalog: () => void catalogQuery.refetch(),
      hydrated,
    }),
    [
      form,
      patchForm,
      setForm,
      startService,
      clearDraft,
      liveConfig,
      feesConfig,
      scheduling,
      catalogQuery,
      hydrated,
    ],
  );

  return (
    <BookingWizardContext.Provider value={value}>{children}</BookingWizardContext.Provider>
  );
}

export function useBookingWizard() {
  const ctx = useContext(BookingWizardContext);
  if (!ctx) {
    throw new Error("useBookingWizard must be used within BookingWizardProvider");
  }
  return ctx;
}
