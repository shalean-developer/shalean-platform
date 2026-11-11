import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@shalean/utils";
import { Ionicons } from "@expo/vector-icons";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ErrorState } from "@/components/ui/StateViews";
import { SectionCard } from "@/components/ui/SectionCard";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { JobListCard } from "@/features/jobs/JobListCard";
import { useCleanerRoster } from "@/hooks/useCleanerDashboard";
import { jobsForDate, useScheduleJobs } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { buildScheduleDays, dayAvailabilityLabel } from "@/lib/jobs/scheduleDays";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

/**
 * Schedule — week strip + day jobs + roster availability hint.
 */
export default function ScheduleScreen() {
  const { refreshProfile } = useAuth();
  const { syncNow } = useConnectivity();
  const { refetch: refetchProfile } = useCleanerProfile();
  const { data: allJobs, isLoading, isError, error, refetch, isRefetching, isFetching } =
    useScheduleJobs(13);
  const { data: roster, refetch: refetchRoster } = useCleanerRoster();

  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildScheduleDays(14).slice(weekOffset * 7, weekOffset * 7 + 7), [weekOffset]);
  const [selectedYmd, setSelectedYmd] = useState(() => johannesburgCalendarYmd());

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
        contentContainerClassName="px-4 pb-8 pt-1"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                accessibilityState={{ disabled: weekOffset === 0 }}
                disabled={weekOffset === 0}
                onPress={() => {
                  setWeekOffset(0);
                  setSelectedYmd(johannesburgCalendarYmd());
                }}
                className="min-h-touch min-w-touch items-center justify-center"
              >
                <Ionicons name="chevron-back" size={22} color={weekOffset === 0 ? colors.ink.subtle : colors.brand[600]} />
              </Pressable>
              <Text className="text-sm font-semibold text-ink-muted">
                {weekOffset === 0 ? "This week" : "Next week"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next week"
                accessibilityState={{ disabled: weekOffset === 1 }}
                disabled={weekOffset === 1}
                onPress={() => {
                  setWeekOffset(1);
                  setSelectedYmd(johannesburgCalendarYmdAddDays(johannesburgCalendarYmd(), 7));
                }}
                className="min-h-touch min-w-touch items-center justify-center"
              >
                <Ionicons name="chevron-forward" size={22} color={weekOffset === 1 ? colors.ink.subtle : colors.brand[600]} />
              </Pressable>
            </View>
            {availLabel ? <Text className="mb-2 text-sm text-ink-muted">{availLabel}</Text> : null}

            <View className="flex-row gap-2">
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

            {dayJobs.length > 0 ? (
              <Text className="mb-2 mt-4 text-sm font-semibold text-ink-muted">
                {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View className="mt-6 min-h-[210px] items-center justify-center px-5 py-8">
            <Ionicons name="calendar-outline" size={30} color={colors.brand[600]} />
            <Text className="mt-3 text-base font-semibold text-ink">Nothing scheduled</Text>
            <Text className="mt-1 text-center text-sm text-ink-muted">
              Select another day to check upcoming jobs.
            </Text>
          </View>
        }
        renderItem={({ item }: { item: CleanerJobWire }) => <JobListCard job={item} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}
