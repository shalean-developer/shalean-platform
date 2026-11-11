import { useCallback, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/StateViews";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { JobListCard } from "@/features/jobs/JobListCard";
import { NextJobHero } from "@/features/jobs/NextJobHero";
import { useCleanerNotifications } from "@/hooks/useCleanerNotifications";
import { useCleanerDashboard } from "@/hooks/useCleanerDashboard";
import { useTodaysJobs } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  isJobCompleted,
  jobEarningsCents,
  pickNextJob,
  sortJobsByTime,
} from "@/lib/jobs/jobDisplay";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

/**
 * Today command centre — answers “What should I do next?”
 */
export default function TodayScreen() {
  const router = useRouter();
  const { profile: authProfile, refreshProfile } = useAuth();
  const { syncNow, isOnline } = useConnectivity();
  const { data: profileData, refetch: refetchProfile } = useCleanerProfile();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    isFetching,
  } = useTodaysJobs();
  const { data: dashboard, refetch: refetchDashboard } = useCleanerDashboard();
  const { unreadCount } = useCleanerNotifications();

  const cleaner = profileData?.cleaner ?? authProfile?.cleaner;
  const name = cleaner?.full_name?.split(" ")[0] ?? "Cleaner";
  const fullName = cleaner?.full_name ?? "Cleaner";

  const onRefresh = useCallback(async () => {
    await syncNow();
    await Promise.all([refetch(), refetchDashboard(), refetchProfile(), refreshProfile()]);
  }, [refetch, refetchDashboard, refetchProfile, refreshProfile, syncNow]);

  const jobs = useMemo(() => sortJobsByTime(data ?? []), [data]);
  const nextJob = useMemo(() => pickNextJob(jobs), [jobs]);
  const remainingJobs = useMemo(
    () => jobs.filter((j) => j.id !== nextJob?.id && !isJobCompleted(j)),
    [jobs, nextJob],
  );
  const completedCount = useMemo(() => jobs.filter(isJobCompleted).length, [jobs]);

  const earningsLabel = useMemo(() => {
    const fromDashboard = dashboard?.summary?.today_cents;
    if (typeof fromDashboard === "number" && Number.isFinite(fromDashboard)) {
      return formatCleanerJobEarningsLabel(fromDashboard);
    }
    let sum = 0;
    let any = false;
    for (const j of jobs) {
      const c = jobEarningsCents(j);
      if (typeof c === "number" && Number.isFinite(c)) {
        sum += c;
        any = true;
      }
    }
    return any ? formatCleanerJobEarningsLabel(sum) : "—";
  }, [dashboard?.summary?.today_cents, jobs]);

  if (isLoading && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <DashboardSkeleton />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load jobs"
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
        data={remainingJobs}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-8 pt-1"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-2">
            <View className="mb-4 flex-row items-center gap-3">
              <Avatar name={fullName} size="sm" />
              <Text className="flex-1 text-lg font-semibold text-ink" accessibilityRole="header">
                Hi {name}{!isOnline ? " · offline" : ""}
              </Text>
              <Link href={"/(cleaner)/notifications" as Href} asChild>
                <Pressable accessibilityRole="button"
                  accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                  hitSlop={8}
                  className="min-h-touch min-w-touch items-center justify-center rounded-full active:opacity-70">
                  <Ionicons name="notifications-outline" size={24} color={colors.ink.default} />
                  {unreadCount > 0 ? (
                    <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                  ) : null}
                </Pressable>
              </Link>
            </View>
            <View className="mb-3 flex-row gap-2">
              <StatChip label="Earnings" value={earningsLabel} tone="earnings"
                onPress={() => router.push("/(cleaner)/(tabs)/earnings" as Href)} />
              <StatChip label="Jobs" value={String(completedCount)} tone="neutral" />
            </View>

            {nextJob ? <NextJobHero job={nextJob} /> : null}

            {remainingJobs.length > 0 ? (
              <Text className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-muted">
                Later today
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          nextJob ? null : (
            <View className="min-h-[240px] items-center justify-center px-5 py-8">
              <Ionicons name="briefcase-outline" size={30} color={colors.brand[600]} />
              <Text className="mt-3 text-base font-semibold text-ink">No jobs today</Text>
              <Text className="mt-1 text-center text-sm text-ink-muted">
                New assignments will appear here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }: { item: CleanerJobWire }) => <JobListCard job={item} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

function StatChip({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  tone: "earnings" | "neutral";
  onPress?: () => void;
}) {
  const body = (
    <View
      className={`flex-1 rounded-2xl border px-3 py-3 ${
        tone === "earnings" ? "border-earnings-border bg-earnings-bg" : "border-border bg-surface-card"
      }`}
    >
      <Text className="text-caption text-ink-muted">{label}</Text>
      <Text
        className={`mt-0.5 text-base font-bold ${tone === "earnings" ? "text-earnings-fg" : "text-ink"}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-80" accessibilityRole="button">
      {body}
    </Pressable>
  );
}

