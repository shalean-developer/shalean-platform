import { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { LoadingState } from "@/components/ui/StateViews";
import { useCleanerReferrals } from "@/hooks/useCleanerEngagement";
import { useCleanerJobsCard } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { buildEngagementStats, deriveAchievements } from "@/lib/engagement/achievements";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { colors } from "@/theme";

/** Gamification — badges derived from real cleaner stats. */
export default function AchievementsScreen() {
  const { syncNow } = useConnectivity();
  const { profile: authProfile } = useAuth();
  const { data: me, refetch: refetchMe } = useCleanerProfile();
  const { data: jobs, isLoading, refetch: refetchJobs } = useCleanerJobsCard();
  const { data: referrals, refetch: refetchReferrals } = useCleanerReferrals();

  const cleaner = me?.cleaner ?? authProfile?.cleaner;

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

  const achievements = useMemo(() => deriveAchievements(stats), [stats]);
  const unlocked = achievements.filter((a) => a.unlocked).length;

  const onRefresh = useCallback(async () => {
    await syncNow();
    await Promise.all([refetchMe(), refetchJobs(), refetchReferrals()]);
  }, [syncNow, refetchMe, refetchJobs, refetchReferrals]);

  if (isLoading && !jobs && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading achievements…" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} />}
      >
        <SectionCard elevated>
          <Text className="text-center text-title text-ink" accessibilityRole="header">
            {unlocked}/{achievements.length}
          </Text>
          <Text className="mt-1 text-center text-sm text-ink-muted">Achievements unlocked</Text>
          <Text className="mt-3 text-center text-sm text-ink-muted">
            Current streak: {stats.streakDays} day{stats.streakDays === 1 ? "" : "s"}
          </Text>
        </SectionCard>

        {achievements.map((item) => {
          const pct = item.progress
            ? Math.round((item.progress.current / item.progress.target) * 100)
            : item.unlocked
              ? 100
              : 0;
          return (
            <View
              key={item.id}
              className={`rounded-2xl border px-4 py-3.5 ${
                item.unlocked
                  ? "border-earnings-border bg-earnings-bg"
                  : "border-border bg-surface-card"
              }`}
            >
              <View className="flex-row items-start gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: item.unlocked ? colors.status.success.bg : colors.surface.muted,
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={item.unlocked ? colors.status.success.fg : colors.ink.muted}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">{item.title}</Text>
                  <Text className="mt-0.5 text-sm text-ink-muted">{item.description}</Text>
                  {item.progress ? (
                    <View className="mt-2">
                      <ProgressBar
                        value={pct}
                        tone={item.unlocked ? "success" : "brand"}
                        accessibilityLabel={`${item.title} progress ${pct}%`}
                      />
                      <Text className="mt-1 text-caption text-ink-muted">
                        {item.progress.current}/{item.progress.target}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
