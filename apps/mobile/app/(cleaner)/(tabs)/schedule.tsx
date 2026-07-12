import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { johannesburgCalendarYmd } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AvailabilityToggle } from "@/components/ui/AvailabilityToggle";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import { SectionCard } from "@/components/ui/SectionCard";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { JobListCard } from "@/features/jobs/JobListCard";
import { useCleanerRoster, useSetAvailability } from "@/hooks/useCleanerDashboard";
import { jobsForDate, useScheduleJobs } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { buildScheduleDays, dayAvailabilityLabel } from "@/lib/jobs/scheduleDays";
import { formatFriendlyYmd } from "@/lib/jobs/jobDisplay";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useToast } from "@/providers/ToastProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

/**
 * Schedule — week strip + day jobs + roster availability hint.
 */
export default function ScheduleScreen() {
  const { profile: authProfile, refreshProfile } = useAuth();
  const { syncNow, isOnline } = useConnectivity();
  const { showToast } = useToast();
  const { data: profileData, refetch: refetchProfile } = useCleanerProfile();
  const { data: allJobs, isLoading, isError, error, refetch, isRefetching, isFetching } =
    useScheduleJobs(13);
  const { data: roster, refetch: refetchRoster } = useCleanerRoster();
  const availabilityMutation = useSetAvailability();

  const days = useMemo(() => buildScheduleDays(7), []);
  const [selectedYmd, setSelectedYmd] = useState(() => johannesburgCalendarYmd());

  const cleaner = profileData?.cleaner ?? authProfile?.cleaner;
  const isAvailable = cleaner?.is_available !== false;
  const dayJobs = useMemo(() => jobsForDate(allJobs, selectedYmd), [allJobs, selectedYmd]);
  const availLabel = dayAvailabilityLabel(roster?.availability ?? [], selectedYmd);
  const jobCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of allJobs ?? []) {
      const d = String(j.date ?? "").trim();
      if (!d) continue;
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [allJobs]);

  const onRefresh = useCallback(async () => {
    await syncNow();
    await Promise.all([refetch(), refetchRoster(), refetchProfile(), refreshProfile()]);
  }, [refetch, refetchRoster, refetchProfile, refreshProfile, syncNow]);

  const onAvailabilityChange = (next: boolean) => {
    availabilityMutation.mutate(next, {
      onSuccess: () => {
        showToast(next ? "You're available for jobs" : "You're marked unavailable", "success");
        void refreshProfile();
      },
      onError: (err) => Alert.alert("Could not update availability", friendlyErrorMessage(err)),
    });
  };

  if (isLoading && !allJobs) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <DashboardSkeleton />
      </View>
    );
  }

  if (isError && !allJobs) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load schedule"
          message={friendlyErrorMessage(error)}
          onRetry={() => void onRefresh()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <FlatList
        data={dayJobs}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow px-4 pb-10 pt-2"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="text-title text-ink" accessibilityRole="header">
              Schedule
            </Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {formatFriendlyYmd(selectedYmd)}
              {availLabel ? ` · ${availLabel}` : ""}
            </Text>

            <View className="mt-3">
              <AvailabilityToggle
                value={isAvailable}
                onChange={onAvailabilityChange}
                loading={availabilityMutation.isPending}
                disabled={!isOnline && !availabilityMutation.isPending}
              />
            </View>

            <View className="mt-3 flex-row gap-2">
              {days.map((day) => {
                const selected = day.ymd === selectedYmd;
                const count = jobCounts.get(day.ymd) ?? 0;
                return (
                  <Pressable
                    key={day.ymd}
                    onPress={() => setSelectedYmd(day.ymd)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${day.weekday} ${day.dayNum}${day.isToday ? ", today" : ""}, ${count} jobs`}
                    className={`min-h-touch flex-1 items-center rounded-2xl border py-2 ${
                      selected ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                    }`}
                  >
                    <Text
                      className={`text-caption font-semibold ${selected ? "text-brand-600" : "text-ink-muted"}`}
                    >
                      {day.weekday}
                    </Text>
                    <Text className={`mt-0.5 text-lg font-bold ${selected ? "text-brand-700" : "text-ink"}`}>
                      {day.dayNum}
                    </Text>
                    <View
                      className="mt-1 h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: count > 0 ? colors.brand[500] : "transparent",
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>

            {(roster?.workingAreas?.length ?? 0) > 0 ? (
              <SectionCard className="mt-3" title="Working areas">
                <Text className="text-sm text-ink">
                  {roster!.workingAreas.map((a) => a.name).join(" · ")}
                </Text>
              </SectionCard>
            ) : null}

            <Text className="mb-2 mt-4 text-label font-semibold uppercase tracking-wide text-ink-muted">
              {dayJobs.length === 0
                ? "No jobs this day"
                : `${dayJobs.length} job${dayJobs.length === 1 ? "" : "s"}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing scheduled"
            message="No jobs on this day yet. Pull to refresh, or check another day on the strip."
            icon="calendar-outline"
          />
        }
        renderItem={({ item }: { item: CleanerJobWire }) => <JobListCard job={item} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}
