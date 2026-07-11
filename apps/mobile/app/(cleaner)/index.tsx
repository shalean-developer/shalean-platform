import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { johannesburgCalendarYmd } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { JobListCard } from "@/features/jobs/JobListCard";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { formatFriendlyYmd } from "@/lib/jobs/jobDisplay";
import { useTodaysJobs } from "@/hooks/useCleanerJobs";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

export default function CleanerHomeScreen() {
  const { profile } = useAuth();
  const { syncNow, isOnline } = useConnectivity();
  const { data, isLoading, isError, error, refetch, isRefetching, isFetching } = useTodaysJobs();
  const today = johannesburgCalendarYmd();
  const name = profile?.cleaner?.full_name?.split(" ")[0] ?? "Cleaner";

  const onRefresh = useCallback(async () => {
    await syncNow();
    await refetch();
  }, [refetch, syncNow]);

  if (isLoading && !data) {
    return (
      <View className="flex-1 bg-surface">
        <Stack.Screen options={{ headerRight: () => <HomeHeaderActions /> }} />
        <OfflineBanner />
        <LoadingState label="Loading today's jobs…" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 bg-surface">
        <Stack.Screen options={{ headerRight: () => <HomeHeaderActions /> }} />
        <OfflineBanner />
        <ErrorState
          title="Could not load jobs"
          message={friendlyErrorMessage(error)}
          onRetry={() => void onRefresh()}
        />
      </View>
    );
  }

  const jobs = data ?? [];

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen options={{ headerRight: () => <HomeHeaderActions /> }} />
      <OfflineBanner />
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow px-4 pb-10 pt-2"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-sm text-ink-muted" accessibilityRole="text">
              Hi {name}
              {!isOnline ? " · offline" : ""}
            </Text>
            <Text className="mt-0.5 text-xl font-bold text-ink" accessibilityRole="header">
              Today · {formatFriendlyYmd(today)}
            </Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {jobs.length === 0
                ? "No jobs scheduled"
                : `${jobs.length} job${jobs.length === 1 ? "" : "s"} today`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No jobs today"
            message="When you are assigned jobs for today, they will show up here. Pull down to refresh."
            icon="briefcase-outline"
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

function HomeHeaderActions() {
  return (
    <View className="mr-1 flex-row items-center">
      <Link href="/(cleaner)/profile" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          hitSlop={8}
          className="min-h-11 min-w-11 items-center justify-center active:opacity-70"
        >
          <Ionicons name="person-circle-outline" size={26} color={colors.ink.default} />
        </Pressable>
      </Link>
      <Link href="/(cleaner)/settings" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={8}
          className="min-h-11 min-w-11 items-center justify-center active:opacity-70"
        >
          <Ionicons name="settings-outline" size={22} color={colors.ink.default} />
        </Pressable>
      </Link>
    </View>
  );
}
