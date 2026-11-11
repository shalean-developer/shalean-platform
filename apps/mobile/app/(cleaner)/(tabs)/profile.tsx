import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { useCleanerJobsCard } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { buildEngagementStats, deriveAchievements } from "@/lib/engagement/achievements";
import { useAuth } from "@/providers/AuthProvider";
import { useMemo } from "react";

/**
 * Profile tab — workforce hub with engagement links.
 */
export default function ProfileTabScreen() {
  const router = useRouter();
  const { profile: authProfile } = useAuth();
  const { isOnline } = useConnectivity();
  const { data, isLoading, isError, error, refetch, isRefetching } = useCleanerProfile();
  const { data: jobs } = useCleanerJobsCard();
  const cleaner = data?.cleaner ?? authProfile?.cleaner;

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
  const unlocked = useMemo(
    () => deriveAchievements(stats).filter((a) => a.unlocked).length,
    [stats],
  );

  if (isLoading && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading profile…" />
      </View>
    );
  }

  if (isError && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load profile"
          message={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!cleaner) {
    return <EmptyState title="No profile" message="Cleaner profile is unavailable." icon="person-outline" />;
  }

  const fullName = cleaner.full_name ?? "Cleaner";
  const statusLabel = formatStatus(cleaner.status);


  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-2 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <SectionCard className="py-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Contact details" onPress={() => router.push("/(cleaner)/contact" as Href)} className="flex-row items-center gap-3">
            <Avatar name={fullName} size="lg" />
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink" accessibilityRole="header" numberOfLines={2}>
                {fullName}
              </Text>
              <View className="mt-1 flex-row flex-wrap items-center gap-2">
                <Text className="text-xs font-semibold text-brand-600">{statusLabel}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink.muted} />
          </Pressable>
        </SectionCard>

        <View className="flex-row gap-2">
          <StatTile
            label="Rating"
            value={typeof cleaner.rating === "number" && cleaner.rating > 0 && (cleaner.jobs_completed ?? 0) > 0 ? cleaner.rating.toFixed(1) : "—"}
          />
          <StatTile
            label="Jobs"
            value={typeof cleaner.jobs_completed === "number" ? String(cleaner.jobs_completed) : "—"}
          />
          <StatTile
            label="Badges"
            value={String(unlocked)}
          />
        </View>

        <SectionCard flush className="overflow-hidden p-0">
          <ListRow
            label="Performance"
            icon="stats-chart-outline"
            onPress={() => router.push("/(cleaner)/performance" as Href)}
          />
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Achievements"
              icon="trophy-outline"
              onPress={() => router.push("/(cleaner)/achievements" as Href)}
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Referrals"
              icon="people-outline"
              onPress={() => router.push("/(cleaner)/referral" as Href)}
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Training"
              icon="school-outline"
              onPress={() => router.push("/(cleaner)/training" as Href)}
            />
          </View>
        </SectionCard>

        <SectionCard flush className="overflow-hidden p-0">
          <ListRow label="Contact" icon="call-outline" onPress={() => router.push("/(cleaner)/contact" as Href)} />
          <View className="mx-4 border-t border-border" />
          <ListRow
            label="Notifications"
            icon="notifications-outline"
            onPress={() => router.push("/(cleaner)/notifications" as Href)}
          />
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Support"
              icon="help-buoy-outline"
              onPress={() => router.push("/(cleaner)/support" as Href)}
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Settings"
              icon="settings-outline"
              onPress={() => router.push("/(cleaner)/settings")}
            />
          </View>
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-border bg-surface-card px-2 py-3">
      <Text className="text-lg font-bold text-ink">{value}</Text>
      <Text className="mt-0.5 text-caption text-ink-muted">{label}</Text>
    </View>
  );
}

function formatStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "Active";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
