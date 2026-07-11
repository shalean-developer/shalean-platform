import { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useCleanerEarnings } from "@/hooks/useCleanerDashboard";
import { useCleanerProfileSummary, useCleanerReferrals } from "@/hooks/useCleanerEngagement";
import { useCleanerJobsCard } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { buildEngagementStats, deriveAchievements } from "@/lib/engagement/achievements";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";

/** Performance hub — rating, reliability, earnings, streak. */
export default function PerformanceScreen() {
  const router = useRouter();
  const { syncNow } = useConnectivity();
  const { profile: authProfile } = useAuth();
  const { data: me, isLoading: meLoading, refetch: refetchMe } = useCleanerProfile();
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs, isError, error } =
    useCleanerJobsCard();
  const { data: earnings, refetch: refetchEarnings } = useCleanerEarnings();
  const { data: summary, refetch: refetchSummary } = useCleanerProfileSummary();
  const { data: referrals, refetch: refetchReferrals } = useCleanerReferrals();

  const cleaner = me?.cleaner ?? authProfile?.cleaner;
  const loading = (meLoading || jobsLoading) && !cleaner && !jobs;

  const stats = useMemo(
    () =>
      buildEngagementStats({
        jobs,
        jobsCompleted: cleaner?.jobs_completed,
        rating: cleaner?.rating,
        referralsCount: referrals?.referralsCount,
      }),
    [jobs, cleaner?.jobs_completed, cleaner?.rating, referrals?.referralsCount],
  );

  const unlockedCount = useMemo(
    () => deriveAchievements(stats).filter((a) => a.unlocked).length,
    [stats],
  );

  const onRefresh = useCallback(async () => {
    await syncNow();
    await Promise.all([
      refetchMe(),
      refetchJobs(),
      refetchEarnings(),
      refetchSummary(),
      refetchReferrals(),
    ]);
  }, [syncNow, refetchMe, refetchJobs, refetchEarnings, refetchSummary, refetchReferrals]);

  if (loading) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading performance…" />
      </View>
    );
  }

  if (isError && !jobs && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load performance"
          message={friendlyErrorMessage(error)}
          onRetry={() => void onRefresh()}
        />
      </View>
    );
  }

  if (!cleaner) {
    return <EmptyState title="No profile" message="Cleaner profile is unavailable." />;
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} />}
      >
        <View className="flex-row gap-2">
          <Metric
            label="Rating"
            value={stats.rating != null ? stats.rating.toFixed(1) : "—"}
          />
          <Metric label="Jobs done" value={String(stats.jobsCompleted)} />
          <Metric label="Streak" value={`${stats.streakDays}d`} />
        </View>

        <SectionCard title="This week">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm text-ink-muted">Completion</Text>
            <Text className="text-sm font-semibold text-ink">
              {stats.completedThisWeek}/{stats.weekScheduled}
              {stats.weekCompletionRate != null ? ` · ${stats.weekCompletionRate}%` : ""}
            </Text>
          </View>
          <ProgressBar
            value={stats.weekCompletionRate ?? 0}
            accessibilityLabel="Week completion rate"
          />
          <Text className="mt-3 text-sm text-ink-muted">
            Week earnings{" "}
            <Text className="font-semibold text-earnings-fg">
              {formatCleanerJobEarningsLabel(earnings?.summary?.week_cents)}
            </Text>
          </Text>
        </SectionCard>

        <SectionCard title="Career">
          <Text className="text-sm text-ink">
            All-time earnings{" "}
            <Text className="font-semibold text-earnings-fg">
              {formatCleanerJobEarningsLabel(summary?.total_all_time_cents)}
            </Text>
          </Text>
          {summary?.payout_schedule_headline ? (
            <Text className="mt-2 text-sm text-ink-muted">
              {summary.payout_schedule_headline}
              {summary.payout_schedule_sub ? ` · ${summary.payout_schedule_sub}` : ""}
            </Text>
          ) : null}
          {summary?.has_failed_transfer ? (
            <Text className="mt-2 text-sm font-medium text-danger">
              A recent payout needs attention — contact support.
            </Text>
          ) : null}
        </SectionCard>

        <SectionCard title="Engagement">
          <Text className="text-sm text-ink-muted">
            {unlockedCount} achievements unlocked · {stats.referralsCount} successful referrals
          </Text>
          <AppButton
            label="View achievements"
            variant="secondary"
            className="mt-3"
            onPress={() => router.push("/(cleaner)/achievements" as Href)}
          />
          <AppButton
            label="Training tips"
            variant="ghost"
            className="mt-2"
            onPress={() => router.push("/(cleaner)/training" as Href)}
          />
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-border bg-surface-card px-2 py-3">
      <Text className="text-lg font-bold text-ink">{value}</Text>
      <Text className="mt-0.5 text-caption text-ink-muted">{label}</Text>
    </View>
  );
}
