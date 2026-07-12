import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ErrorState, LoadingState, Screen } from "@shalean/mobile-ui";
import { SoftCard } from "@/features/shared/SoftUi";
import { homeColors } from "@/features/home/homeTheme";
import { AppText } from "@/theme";
import { AddressFields } from "@/features/booking/components/AddressFields";
import { EquipmentToggle } from "@/features/booking/components/EquipmentToggle";
import { ExtrasPicker } from "@/features/booking/components/ExtrasPicker";
import { ServiceQuestions } from "@/features/booking/components/ServiceQuestions";
import { BookingStepHeader } from "@/features/booking/BookingStepHeader";
import { BookingStickyFooter } from "@/features/booking/BookingStickyFooter";
import { useBookingWizard } from "@/features/booking/BookingWizardProvider";
import { useEquipmentQuote } from "@/features/booking/hooks/useEquipmentQuote";
import { useResolveLocation } from "@/features/booking/hooks/useResolveLocation";
import {
  useCustomerAddresses,
  useCustomerProfile,
} from "@/hooks/useCustomerAccount";
import {
  bookingFormPatchFromBookingRow,
  bookingServiceSlugFromBookingRow,
} from "@/lib/booking/rebookFromBookingRow";
import { bookingFormPatchFromCustomerProfile } from "@/lib/booking/prefillFromCustomerProfile";
import { step1Schema } from "@/lib/booking/schemas";
import { defaultCleanerMode, isServiceSlug, SERVICE_LABELS } from "@/lib/booking/serviceMeta";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { getBookingV2Api, getCustomerBookingsApi } from "@/services/customerApi";
import type { ResolveLocationResponse } from "@/services/types/bookingV2";
import type { CustomerBookingDetailResponse } from "@/services/types/customerBookings";

export default function BookingDetailsScreen() {
  const router = useRouter();
  const { slug, rebook } = useLocalSearchParams<{ slug: string; rebook?: string }>();
  const rebookId = (Array.isArray(rebook) ? rebook[0] : rebook)?.trim() ?? "";
  const {
    form,
    patchForm,
    setForm,
    startService,
    liveConfig,
    catalogLoading,
    catalogError,
    refetchCatalog,
    hydrated,
  } = useBookingWizard();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rebookLoading, setRebookLoading] = useState(Boolean(rebookId));
  const [rebookError, setRebookError] = useState<string | null>(null);
  const [rebookRetry, setRebookRetry] = useState(0);
  const rebookAppliedRef = useRef<string | null>(null);
  const profilePrefillDoneRef = useRef(false);

  const profileQuery = useCustomerProfile();
  const addressesQuery = useCustomerAddresses();

  useEffect(() => {
    profilePrefillDoneRef.current = false;
  }, [form.serviceSlug, rebookId]);

  // Wait for AsyncStorage draft restore, then align form to the route slug
  // (skip wipe when a rebook prefill is in flight / applied).
  useEffect(() => {
    if (!hydrated) return;
    if (rebookId) return;
    if (slug && isServiceSlug(slug) && form.serviceSlug !== slug) {
      startService(slug);
    }
  }, [hydrated, slug, form.serviceSlug, startService, rebookId]);

  // Prefill phone + default saved address from customer profile when empty.
  useEffect(() => {
    if (!hydrated || rebookId) return;
    if (profilePrefillDoneRef.current) return;
    if (profileQuery.isLoading || addressesQuery.isLoading) return;

    const patch = bookingFormPatchFromCustomerProfile({
      form,
      profile: profileQuery.data,
      addresses: addressesQuery.data,
    });
    profilePrefillDoneRef.current = true;
    if (Object.keys(patch).length === 0) return;
    patchForm(patch);
    // Intentionally read form once when profile/addresses settle — do not re-run on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill
  }, [
    hydrated,
    rebookId,
    profileQuery.isLoading,
    profileQuery.data,
    addressesQuery.isLoading,
    addressesQuery.data,
    patchForm,
  ]);

  // Prefill from prior booking (signed-in path uses bookings.get).
  useEffect(() => {
    if (!hydrated || !rebookId) {
      setRebookLoading(false);
      return;
    }
    if (rebookAppliedRef.current === rebookId) {
      setRebookLoading(false);
      return;
    }
    let cancelled = false;
    setRebookLoading(true);
    setRebookError(null);
    void (async () => {
      try {
        const result = await getCustomerBookingsApi().get<CustomerBookingDetailResponse>(rebookId);
        if (cancelled) return;
        if (!result.ok || !result.data.booking) {
          setRebookError(result.ok ? "Booking not found." : result.error);
          setRebookLoading(false);
          return;
        }
        const row = result.data.booking;
        const rowSlug = bookingServiceSlugFromBookingRow(row);
        if (slug && isServiceSlug(slug) && rowSlug !== slug) {
          router.replace(`/book/${rowSlug}/details?rebook=${encodeURIComponent(rebookId)}` as never);
          return;
        }
        const mode = liveConfig?.cleanerMode ?? defaultCleanerMode(rowSlug);
        const patch = bookingFormPatchFromBookingRow(row, rowSlug, mode);
        if (patch.suburb.trim().length >= 2) {
          const loc = await getBookingV2Api().resolveLocation<ResolveLocationResponse>({
            suburb: patch.suburb.trim(),
          });
          if (!cancelled && loc.ok && loc.data.ok && loc.data.locationId) {
            patch.serviceAreaLocationId = loc.data.locationId;
            patch.serviceAreaCityId = loc.data.cityId ?? "";
          }
        }
        if (cancelled) return;
        setForm(patch);
        rebookAppliedRef.current = rebookId;
        setRebookLoading(false);
        router.replace(`/book/${rowSlug}/schedule?rebook=${encodeURIComponent(rebookId)}` as never);
      } catch (err) {
        if (!cancelled) {
          setRebookError(friendlyErrorMessage(err));
          setRebookLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, rebookId, rebookRetry, slug, liveConfig?.cleanerMode, setForm, router]);

  const location = useResolveLocation(form.suburb);

  useEffect(() => {
    if (
      location.locationId !== form.serviceAreaLocationId ||
      location.cityId !== form.serviceAreaCityId
    ) {
      patchForm({
        serviceAreaLocationId: location.locationId,
        serviceAreaCityId: location.cityId,
      });
    }
  }, [
    location.locationId,
    location.cityId,
    form.serviceAreaLocationId,
    form.serviceAreaCityId,
    patchForm,
  ]);

  const showEquipment =
    liveConfig?.showEquipmentQuestion ?? liveConfig?.showCleaningProductsQuestion ?? false;

  const equipment = useEquipmentQuote({
    enabled: showEquipment,
    equipmentRequired: form.equipmentRequired,
    address: form.address,
    suburb: form.suburb,
    city: form.city ?? "Cape Town",
    postalCode: form.postalCode ?? "",
  });

  useEffect(() => {
    if (!showEquipment) return;
    if (form.equipmentRequired !== "yes") {
      if (form.equipmentQuote) patchForm({ equipmentQuote: null });
      return;
    }
    if (equipment.quote !== form.equipmentQuote) {
      patchForm({ equipmentQuote: equipment.quote });
    }
  }, [
    showEquipment,
    form.equipmentRequired,
    form.equipmentQuote,
    equipment.quote,
    patchForm,
  ]);

  const questions = liveConfig?.step1Questions ?? [];
  const requiredKeys = useMemo(
    () => questions.filter((q) => q.required).map((q) => q.key),
    [questions],
  );

  if (!hydrated || rebookLoading || (catalogLoading && !liveConfig)) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label={rebookId ? "Loading previous booking…" : "Loading booking…"} />
      </Screen>
    );
  }

  if (rebookError) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t prefill rebook"
          message={rebookError}
          onRetry={() => {
            rebookAppliedRef.current = null;
            setRebookError(null);
            setRebookRetry((n) => n + 1);
          }}
        />
      </Screen>
    );
  }

  if (catalogError && !liveConfig) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load service"
          message={catalogError.message}
          onRetry={refetchCatalog}
        />
      </Screen>
    );
  }

  const serviceLabel =
    liveConfig?.label ??
    (slug && isServiceSlug(slug) ? SERVICE_LABELS[slug] : "Service");

  function validateAndContinue() {
    const errors: Record<string, string> = {};
    for (const key of requiredKeys) {
      const v = form.serviceDetails[key];
      if (v === undefined || v === null || v === "") {
        errors[key] = "Required";
      }
    }

    const parsed = step1Schema.safeParse({
      serviceDetails: form.serviceDetails,
      address: form.address,
      suburb: form.suburb,
      serviceAreaLocationId: form.serviceAreaLocationId,
      serviceAreaCityId: form.serviceAreaCityId,
      city: form.city,
      postalCode: form.postalCode,
      accessInstructions: form.accessInstructions,
      parkingInstructions: form.parkingInstructions,
      gateCode: form.gateCode,
      contactPhone: form.contactPhone,
      selectedExtras: form.selectedExtras,
      equipmentRequired: form.equipmentRequired || "no",
      equipmentQuote: form.equipmentQuote,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    if (!form.serviceAreaLocationId.trim() && form.suburb.trim().length >= 2) {
      errors.suburb = location.error || "Select a suburb we service";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    router.push(`/book/${form.serviceSlug}/schedule` as never);
  }

  return (
    <Screen
      scroll={false}
      edges={["top", "bottom"]}
      contentClassName="flex-1"
      style={{ backgroundColor: homeColors.bg }}
    >
      <View className="flex-1 px-4 pt-2">
        <BookingStepHeader step={1} title={serviceLabel} />
        {rebookId ? (
          <AppText variant="secondary" className="mb-3 text-brand-600">
            Prefilling from a previous booking — pick a new date and time next.
          </AppText>
        ) : null}
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-4"
          keyboardShouldPersistTaps="handled"
        >
          <SoftCard title="About your space">
            <ServiceQuestions
              questions={questions.filter((q) => q.key !== "specialInstructions")}
              values={form.serviceDetails}
              errors={fieldErrors}
              onChange={(key, value) =>
                patchForm({
                  serviceDetails: { ...form.serviceDetails, [key]: value },
                })
              }
            />
          </SoftCard>

          <SoftCard title="Address & contact">
            <AddressFields
              address={form.address}
              suburb={form.suburb}
              city={form.city ?? "Cape Town"}
              postalCode={form.postalCode ?? ""}
              accessInstructions={form.accessInstructions}
              parkingInstructions={form.parkingInstructions}
              gateCode={form.gateCode}
              contactPhone={form.contactPhone}
              specialInstructions={String(form.serviceDetails.specialInstructions ?? "")}
              locationLoading={location.loading}
              locationError={location.error}
              errors={fieldErrors}
              onChange={(patch) => patchForm(patch)}
              onSpecialInstructionsChange={(value) =>
                patchForm({
                  serviceDetails: { ...form.serviceDetails, specialInstructions: value },
                })
              }
            />
          </SoftCard>

          {(liveConfig?.extras?.length ?? 0) > 0 ? (
            <SoftCard>
              <ExtrasPicker
                extras={liveConfig?.extras ?? []}
                selected={form.selectedExtras}
                onToggle={(id) => {
                  const selected = form.selectedExtras.includes(id)
                    ? form.selectedExtras.filter((x) => x !== id)
                    : [...form.selectedExtras, id];
                  patchForm({ selectedExtras: selected });
                }}
              />
            </SoftCard>
          ) : null}

          {showEquipment ? (
            <SoftCard>
              <EquipmentToggle
                required={form.equipmentRequired}
                onChange={(v) => patchForm({ equipmentRequired: v })}
                quote={equipment.quote}
                loading={equipment.loading}
                error={equipment.error}
                addressBlocked={!equipment.canQuote}
              />
            </SoftCard>
          ) : null}
        </ScrollView>
      </View>
      <BookingStickyFooter
        onPress={validateAndContinue}
        amountZar={form.pricingSummary?.estimated_total ?? form.pricingSummary?.total}
      />
    </Screen>
  );
}
