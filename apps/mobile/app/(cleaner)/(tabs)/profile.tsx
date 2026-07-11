import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AvailabilityToggle } from "@/components/ui/AvailabilityToggle";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { useSetAvailability } from "@/hooks/useCleanerDashboard";
import { useCleanerReferrals } from "@/hooks/useCleanerEngagement";
import { useCleanerJobsCard } from "@/hooks/useCleanerJobs";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { buildEngagementStats, deriveAchievements } from "@/lib/engagement/achievements";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useToast } from "@/providers/ToastProvider";
import { colors } from "@/theme";
import { useMemo } from "react";

/**
 * Profile tab — workforce hub with engagement links.
 */
export default function ProfileTabScreen() {
  const router = useRouter();
  const { profile: authProfile, refreshProfile } = useAuth();
  const { isOnline } = useConnectivity();
  const { showToast } = useToast();
  const { data, isLoading, isError, error, refetch, isRefetching } = useCleanerProfile();
  const { data: jobs } = useCleanerJobsCard();
  const { data: referrals } = useCleanerReferrals();
  const availabilityMutation = useSetAvailability();
  const cleaner = data?.cleaner ?? authProfile?.cleaner;
  const completionPct = data?.completion_pct ?? authProfile?.completion_pct;

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
  const phone = cleaner.phone_number || cleaner.phone || "No phone on file";
  const statusLabel = formatStatus(cleaner.status);
  const isAvailable = cleaner.is_available !== false;

  const onAvailabilityChange = (next: boolean) => {
    availabilityMutation.mutate(next, {
      onSuccess: () => {
        showToast(next ? "You're available for jobs" : "You're marked unavailable", "success");
        void refreshProfile();
        void refetch();
      },
      onError: (err) => {
        Alert.alert("Could not update availability", friendlyErrorMessage(err));
      },
    });
  };

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4 pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <SectionCard elevated className="items-center py-6">
          <Avatar name={fullName} size="lg" />
          <Text className="mt-3 text-title text-ink" accessibilityRole="header">
            {fullName}
          </Text>
          <View className="mt-2 rounded-md bg-brand-50 px-2.5 py-1">
            <Text className="text-xs font-semibold uppercase text-brand-600">{statusLabel}</Text>
          </View>
          <View className="mt-3 flex-row items-center gap-2">
            <View
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: isOnline ? colors.status.success.fg : colors.ink.subtle,
              }}
              accessibilityElementsHidden
            />
            <Text className="text-sm text-ink-muted">
              {isOnline ? "Online" : "Offline"}
              {stats.streakDays > 0 ? ` · ${stats.streakDays}-day streak` : ""}
            </Text>
          </View>
        </SectionCard>

        <AvailabilityToggle
          value={isAvailable}
          onChange={onAvailabilityChange}
          loading={availabilityMutation.isPending}
          disabled={!isOnline && !availabilityMutation.isPending}
        />

        <View className="flex-row gap-2">
          <StatTile
            label="Rating"
            value={typeof cleaner.rating === "number" ? cleaner.rating.toFixed(1) : "—"}
          />
          <StatTile
            label="Jobs done"
            value={typeof cleaner.jobs_completed === "number" ? String(cleaner.jobs_completed) : "—"}
          />
          <StatTile
            label="Badges"
            value={String(unlocked)}
          />
        </View>

        {typeof completionPct === "number" ? (
          <Text className="text-center text-caption text-ink-muted">
            Profile {Math.round(completionPct)}% complete
          </Text>
        ) : null}

        <SectionCard flush className="overflow-hidden p-0">
          <ListRow label="Phone" value={phone} icon="call-outline" showChevron={false} />
          {cleaner.email ? (
            <View className="mx-4 border-t border-border">
              <ListRow label="Email" value={cleaner.email} icon="mail-outline" showChevron={false} />
            </View>
          ) : null}
        </SectionCard>

        <SectionCard flush className="overflow-hidden p-0">
          <ListRow
            label="Performance"
            value={stats.streakDays > 0 ? `${stats.streakDays}d streak` : undefined}
            icon="stats-chart-outline"
            onPress={() => router.push("/(cleaner)/performance" as Href)}
          />
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Achievements"
              value={`${unlocked} unlocked`}
              icon="trophy-outline"
              onPress={() => router.push("/(cleaner)/achievements" as Href)}
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Refer cleaners"
              value={referrals?.referralCode ?? "Earn rewards"}
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
