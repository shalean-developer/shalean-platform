import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@shalean/mobile-ui";
import { SoftCard } from "@/features/shared/SoftUi";
import { homeColors } from "@/features/home/homeTheme";
import { AppText } from "@/theme";
import { CleanerPicker, TeamPicker } from "@/features/booking/components/CleanerTeamPickers";
import {
  BookingTypePicker,
  DateChips,
  TimeSlotGrid,
} from "@/features/booking/components/SchedulePickers";
import { BookingStepHeader } from "@/features/booking/BookingStepHeader";
import { BookingStickyFooter } from "@/features/booking/BookingStickyFooter";
import { useBookingWizard } from "@/features/booking/BookingWizardProvider";
import {
  useAvailableCleaners,
  useTeamAvailability,
} from "@/features/booking/hooks/useCleanerAvailability";
import { buildStep2Schema } from "@/lib/booking/schemas";
import type { AvailableCleanerV2 } from "@/services/types/bookingV2";
import { filterCustomerOnlineBookingTimeSlots } from "@/lib/booking/timeSlots";

export default function BookingScheduleScreen() {
  const router = useRouter();
  const { form, patchForm, liveConfig, scheduling } = useBookingWizard();
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      form.date
        ? filterCustomerOnlineBookingTimeSlots(form.date, { scheduling: scheduling ?? undefined })
        : [],
    [form.date, scheduling],
  );

  const isTeam = form.cleanerMode === "team";
  const durationMinutes =
    form.pricingSummary.estimated_duration_minutes ||
    Math.round((liveConfig?.estimatedDurationHours ?? 2) * 60);

  const teamsQuery = useTeamAvailability({
    date: form.date,
    serviceSlug: form.serviceSlug,
    enabled: isTeam,
  });

  const cleanersQuery = useAvailableCleaners({
    serviceSlug: form.serviceSlug,
    date: form.date,
    time: form.time,
    durationMinutes,
    locationId: form.serviceAreaLocationId,
    enabled: !isTeam,
  });

  function toggleCleaner(cleaner: AvailableCleanerV2) {
    const ids = form.selectedCleanerIds;
    const max = form.cleanerCount;
    if (ids.includes(cleaner.id)) {
      patchForm({
        selectedCleanerIds: ids.filter((id) => id !== cleaner.id),
        selectedCleanerDetails: form.selectedCleanerDetails.filter((c) => c.id !== cleaner.id),
      });
      return;
    }
    const nextIds = ids.length >= max ? [...ids.slice(1), cleaner.id] : [...ids, cleaner.id];
    const nextDetails = [
      ...form.selectedCleanerDetails.filter((c) => nextIds.includes(c.id)),
      cleaner,
    ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
    patchForm({ selectedCleanerIds: nextIds, selectedCleanerDetails: nextDetails });
  }

  function validateAndContinue() {
    const schema = buildStep2Schema(scheduling ?? undefined);
    const parsed = schema.safeParse({
      bookingType: form.bookingType,
      date: form.date,
      time: form.time,
      alternativeDate: form.alternativeDate,
      alternativeTime: form.alternativeTime,
      recurringFrequency: form.recurringFrequency,
      recurringDays: form.recurringDays,
      recurringStartDate: form.recurringStartDate,
      recurringEndDate: form.recurringEndDate,
      cleanerMode: form.cleanerMode,
      assignedTeamId: form.assignedTeamId,
      assignedTeamName: form.assignedTeamName,
      cleanerCount: form.cleanerCount,
      selectedCleanerIds: form.selectedCleanerIds,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the schedule.");
      return;
    }

    if (!isTeam) {
      if (!form.serviceAreaLocationId.trim()) {
        setError("Confirm your suburb in Details so we can check cleaner availability.");
        return;
      }
      if (cleanersQuery.isFetching) {
        setError("Checking cleaner availability…");
        return;
      }
      if (cleanersQuery.isError) {
        setError(
          cleanersQuery.error instanceof Error
            ? cleanersQuery.error.message
            : "Could not check cleaner availability.",
        );
        return;
      }
      // Soft fulfillment: allow continue when no instant cleaner — server will
      // create ops_assignment / area_review on confirm.
    }

    setError(null);
    router.push(`/book/${form.serviceSlug}/review` as never);
  }

  return (
    <Screen
      scroll={false}
      edges={["top", "bottom"]}
      contentClassName="flex-1"
      style={{ backgroundColor: homeColors.bg }}
    >
      <View className="flex-1 px-4 pt-2">
        <BookingStepHeader step={2} title="Schedule" subtitle={liveConfig?.label ?? form.serviceSlug} />
        <ScrollView className="flex-1" contentContainerClassName="pb-4" keyboardShouldPersistTaps="handled">
          <SoftCard>
            <BookingTypePicker
              value={form.bookingType}
              onChange={(bookingType) =>
                patchForm({
                  bookingType,
                  recurringFrequency: bookingType === "once_off" ? "" : form.recurringFrequency,
                  recurringDays: bookingType === "once_off" ? [] : form.recurringDays,
                })
              }
              frequency={form.recurringFrequency}
              onFrequencyChange={(recurringFrequency) => patchForm({ recurringFrequency })}
              recurringDays={form.recurringDays}
              onRecurringDaysChange={(recurringDays) => patchForm({ recurringDays })}
            />
          </SoftCard>

          <SoftCard>
            <DateChips
              selected={form.date}
              onSelect={(date) => patchForm({ date, time: "" })}
            />
            <View className="mt-3">
              <TimeSlotGrid
                slots={slots}
                selected={form.time}
                onSelect={(time) => patchForm({ time })}
                emptyMessage={
                  !form.date
                    ? "Select a date first."
                    : !form.serviceAreaLocationId
                      ? "Confirm your suburb in Details to unlock times."
                      : "No morning slots left today — try another day."
                }
              />
            </View>
          </SoftCard>

          <SoftCard>
            {isTeam ? (
              <TeamPicker
                teams={teamsQuery.data?.teams ?? []}
                loading={teamsQuery.isFetching}
                error={
                  teamsQuery.isError
                    ? teamsQuery.error instanceof Error
                      ? teamsQuery.error.message
                      : "Could not load teams"
                    : null
                }
                selectedTeamId={form.assignedTeamId}
                needsDate={!form.date}
                onSelect={(id, name) =>
                  patchForm({ assignedTeamId: id, assignedTeamName: name })
                }
              />
            ) : (
              <CleanerPicker
                cleaners={cleanersQuery.data ?? []}
                loading={cleanersQuery.isFetching}
                error={
                  cleanersQuery.isError
                    ? cleanersQuery.error instanceof Error
                      ? cleanersQuery.error.message
                      : "Could not load cleaners"
                    : null
                }
                selectedIds={form.selectedCleanerIds}
                cleanerCount={form.cleanerCount}
                onCleanerCountChange={(cleanerCount) =>
                  patchForm({
                    cleanerCount,
                    selectedCleanerIds: form.selectedCleanerIds.slice(0, cleanerCount),
                    selectedCleanerDetails: form.selectedCleanerDetails.slice(0, cleanerCount),
                  })
                }
                onToggle={toggleCleaner}
                onClearAll={() =>
                  patchForm({ selectedCleanerIds: [], selectedCleanerDetails: [] })
                }
                needsLocation={!form.serviceAreaLocationId}
              />
            )}
          </SoftCard>

          {error ? (
            <AppText
              variant="secondary"
              className="mb-3 text-danger"
              accessibilityLiveRegion="polite"
            >
              {error}
            </AppText>
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
