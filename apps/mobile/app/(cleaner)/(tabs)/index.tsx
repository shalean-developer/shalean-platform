import { useCallback, useMemo } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatCleanerJobEarningsLabel, johannesburgCalendarYmd } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AvailabilityToggle } from "@/components/ui/AvailabilityToggle";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/StateViews";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { JobListCard } from "@/features/jobs/JobListCard";
import { NextJobHero } from "@/features/jobs/NextJobHero";
import { useCleanerNotifications } from "@/hooks/useCleanerNotifications";
import { useCleanerDashboard, useSetAvailability } from "@/hooks/useCleanerDashboard";
import { useCleanerJobsCard, useTodaysJobs } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { computeCompletionStreak } from "@/lib/engagement/achievements";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  formatFriendlyYmd,
  isJobCompleted,
  jobEarningsCents,
  pickNextJob,
  sortJobsByTime,
} from "@/lib/jobs/jobDisplay";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useToast } from "@/providers/ToastProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

/**
 * Today command centre — answers “What should I do next?”
 */
export default function TodayScreen() {
  const router = useRouter();
  const { profile: authProfile, refreshProfile } = useAuth();
  const { syncNow, isOnline } = useConnectivity();
  const { showToast } = useToast();
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
  const { data: allJobs } = useCleanerJobsCard();
  const availabilityMutation = useSetAvailability();
  const { unreadCount } = useCleanerNotifications();
  const streakDays = useMemo(() => computeCompletionStreak(allJobs ?? []), [allJobs]);

  const cleaner = profileData?.cleaner ?? authProfile?.cleaner;
  const today = johannesburgCalendarYmd();
  const name = cleaner?.full_name?.split(" ")[0] ?? "Cleaner";
  const fullName = cleaner?.full_name ?? "Cleaner";
  const isAvailable = cleaner?.is_available !== false;

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
  const activeCount = jobs.length;
  const progressPct = activeCount === 0 ? 0 : Math.round((completedCount / activeCount) * 100);

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

  const motivation = useMemo(() => dailyMotivation(completedCount, activeCount), [completedCount, activeCount]);

  const onAvailabilityChange = (next: boolean) => {
    availabilityMutation.mutate(next, {
      onSuccess: () => {
        showToast(next ? "You're available for jobs" : "You're marked unavailable", "success");
        void refreshProfile();
      },
      onError: (err) => {
        Alert.alert("Could not update availability", friendlyErrorMessage(err));
      },
    });
  };

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
            <View className="mb-3 flex-row items-center gap-3">
              <Avatar name={fullName} size="sm" />
              <View className="flex-1">
                <Text className="text-sm text-ink-muted">
                  Hi {name}
                  {!isOnline ? " · offline" : ""}
                </Text>
                <Text className="text-title text-ink" accessibilityRole="header">
                  Today · {formatFriendlyYmd(today)}
                </Text>
              </View>
              <Pressable
                onPress={() => void onRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Sync jobs"
                hitSlop={8}
                className="min-h-touch min-w-touch items-center justify-center rounded-full active:opacity-70"
              >
                <Ionicons name="sync-outline" size={21} color={colors.brand[600]} />
              </Pressable>
            <Link href={"/(cleaner)/notifications" as Href} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
                }
                hitSlop={8}
                className="min-h-touch min-w-touch items-center justify-center rounded-full active:opacity-70"
              >
                <Ionicons name="notifications-outline" size={24} color={colors.ink.default} />
                {unreadCount > 0 ? (
                  <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                ) : null}
              </Pressable>
            </Link>
            </View>

            <View className="mb-3">
              <AvailabilityToggle
                value={isAvailable}
                onChange={onAvailabilityChange}
                loading={availabilityMutation.isPending}
                disabled={!isOnline && !availabilityMutation.isPending}
              />
            </View>

            <View className="mb-3 flex-row gap-2">
              <StatChip
                label="Earnings"
                value={earningsLabel}
                tone="earnings"
                onPress={() => router.push("/(cleaner)/(tabs)/earnings" as Href)}
              />
              <StatChip
                label="Done"
                value={`${completedCount}/${activeCount || 0}`}
                tone="neutral"
              />
              <StatChip
                label="Left"
                value={String(Math.max(activeCount - completedCount, 0))}
                tone="neutral"
              />
            </View>

            {activeCount > 0 ? (
              <SectionCard className="mb-3">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-ink">Today&apos;s progress</Text>
                  <Text className="text-sm text-ink-muted">{progressPct}%</Text>
                </View>
                <ProgressBar value={progressPct} accessibilityLabel={`Today progress ${progressPct} percent`} />
                <Text className="mt-2 text-caption text-ink-muted">
                  {motivation}
                  {streakDays > 1 ? ` · ${streakDays}-day streak` : ""}
                </Text>
              </SectionCard>
            ) : null}

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
            <View className="items-center rounded-2xl border border-border bg-surface-card px-5 py-8">
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

function dailyMotivation(completed: number, total: number): string {
  if (total === 0) return "Enjoy the quiet day — check Schedule for what’s coming up.";
  if (completed === 0) return "Start with your next job — you’ve got this.";
  if (completed >= total) return "All done for today. Great work.";
  if (completed / total >= 0.5) return "Halfway there — keep the momentum going.";
  return "One job at a time. You’re making progress.";
}
