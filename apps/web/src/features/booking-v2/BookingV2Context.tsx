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
  type BookingV2FormData,
  type BookingStep,
} from "@/src/features/booking-v2/types";
import { step1Schema, step2Schema } from "@/src/features/booking-v2/schemas";
import type { LiveServiceConfig, ServicesCatalog } from "@/app/api/booking-v2/services/route";
import type { BookingV2FeesConfig } from "@/lib/booking-v2/types";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";

export type { LiveServiceConfig };

const STORAGE_KEY = "shalean:booking-v2:v1";

// ─── Context shape ─────────────────────────────────────────────────────────────

type BookingV2ContextValue = {
  form: UseFormReturn<BookingV2FormData>;
  currentStep: BookingStep;
  serviceSlug: ServiceSlug;
  /** Live pricing catalog fetched from DB. Falls back to serviceConfig values when null. */
  liveConfig: LiveServiceConfig | null;
  feesConfig: BookingV2FeesConfig;
  catalogLoading: boolean;
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

function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

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

  const rawStep = Number(searchParams.get("step") ?? "1");
  const currentStep = (
    rawStep >= 1 && rawStep <= 4 ? rawStep : 1
  ) as BookingStep;

  // Live pricing catalog from DB
  const [catalog, setCatalog] = useState<ServicesCatalog | null>(null);
  const [feesConfig, setFeesConfig] = useState<BookingV2FeesConfig>(defaultBookingV2FeesConfig());
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    fetch("/api/booking-v2/services")
      .then((r) => r.json())
      .then((json: { catalog?: ServicesCatalog; feesConfig?: BookingV2FeesConfig }) => {
        if (json.catalog) setCatalog(json.catalog);
        if (json.feesConfig) setFeesConfig(json.feesConfig);
      })
      .catch(() => { /* fall back to static config */ })
      .finally(() => setCatalogLoading(false));
  }, []);

  const liveConfig = catalog ? (catalog[serviceSlug] ?? null) : null;

  // Always start from pure defaults so SSR and the first client render match.
  const defaults = defaultBookingFormData(serviceSlug, config.cleanerMode);

  const form = useForm<BookingV2FormData>({
    defaultValues: defaults,
    mode: "onTouched",
  });

  // After mount: restore persisted state
  useEffect(() => {
    const saved = readFromStorage(serviceSlug);
    if (saved) {
      form.reset({ ...defaults, ...saved }, { keepDefaultValues: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const goToStep = useCallback(
    (step: BookingStep) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(step));
      router.push(`/book/${serviceSlug}?${params.toString()}`);
    },
    [router, searchParams, serviceSlug],
  );

  const canGoNext = useCallback(
    async (step: BookingStep): Promise<boolean> => {
      if (step === 1) {
        const values = form.getValues();
        const result = step1Schema.safeParse(values);
        if (!result.success) {
          result.error.errors.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setError(e.path.join(".") as any, { message: e.message });
          });
          return false;
        }
        return true;
      }
      if (step === 2) {
        const values = form.getValues();
        const result = step2Schema.safeParse(values);
        if (!result.success) {
          result.error.errors.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setError(e.path.join(".") as any, { message: e.message });
          });
          return false;
        }
        return true;
      }
      return true;
    },
    [form],
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

  const clearBooking = useCallback(() => {
    clearStorage();
    form.reset(defaultBookingFormData(serviceSlug, config.cleanerMode));
  }, [form, serviceSlug, config.cleanerMode]);

  const value = useMemo<BookingV2ContextValue>(
    () => ({
      form,
      currentStep,
      serviceSlug,
      liveConfig,
      feesConfig,
      catalogLoading,
      goToStep,
      goNext,
      goBack,
      canGoNext,
      clearBooking,
    }),
    [form, currentStep, serviceSlug, liveConfig, feesConfig, catalogLoading, goToStep, goNext, goBack, canGoNext, clearBooking],
  );

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
