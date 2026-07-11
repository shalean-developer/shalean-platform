import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import { SectionCard } from "@/components/ui/SectionCard";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCleanerDashboard, useCleanerEarnings } from "@/hooks/useCleanerDashboard";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerEarningsRowWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

type Filter = "all" | "pending" | "paid";

/**
 * Earnings — today / week / month + pending/paid history from /api/cleaner/earnings.
 */
export default function EarningsScreen() {
  const router = useRouter();
  const { syncNow } = useConnectivity();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    isFetching,
  } = useCleanerEarnings();
  const { data: dashboard, refetch: refetchDashboard } = useCleanerDashboard();
  const [filter, setFilter] = useState<Filter>("all");

  const summary = data?.summary;
  const todayCents = summary?.today_cents ?? dashboard?.summary?.today_cents;
  const weekCents = summary?.week_cents;
  const monthCents = summary?.month_cents;
  const pendingCents = summary?.pending_cents ?? data?.total_pending;
  const eligibleCents = summary?.eligible_cents ?? data?.total_approved;
  const paidCents = summary?.paid_cents ?? data?.total_paid;

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (filter === "pending") {
      return list.filter((r) => {
        const s = String(r.payout_status).toLowerCase();
        return s === "pending" || s === "eligible";
      });
    }
    if (filter === "paid") {
      return list.filter((r) => String(r.payout_status).toLowerCase() === "paid");
    }
    return list;
  }, [data?.rows, filter]);

  const onRefresh = useCallback(async () => {
    await syncNow();
    await Promise.all([refetch(), refetchDashboard()]);
  }, [refetch, refetchDashboard, syncNow]);

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
          title="Could not load earnings"
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
        data={rows}
        keyExtractor={(item) => item.booking_id}
        contentContainerClassName="grow px-4 pb-10 pt-2"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="text-title text-ink" accessibilityRole="header">
              Earnings
            </Text>
            <Text className="mt-1 text-sm text-ink-muted">Johannesburg calendar · ZAR</Text>

            <View className="mt-3 flex-row gap-2">
              <MoneyTile label="Today" cents={todayCents} highlight />
              <MoneyTile label="This week" cents={weekCents} />
              <MoneyTile label="This month" cents={monthCents} />
            </View>

            <View className="mt-2 flex-row gap-2">
              <MoneyTile label="Pending" cents={pendingCents} />
              <MoneyTile label="Eligible" cents={eligibleCents} />
              <MoneyTile label="Paid" cents={paidCents} />
            </View>

            {data?.paymentDetails?.missingBankDetails ? (
              <SectionCard className="mt-3">
                <Text className="text-sm font-semibold text-status-warning-fg">Bank details needed</Text>
                <Text className="mt-1 text-sm text-ink-muted">
                  Add payout details in the cleaner portal so we can pay you.
                </Text>
              </SectionCard>
            ) : null}

            {typeof summary?.suggested_daily_goal_cents === "number" ? (
              <Text className="mt-3 text-caption text-ink-muted">
                Suggested daily goal{" "}
                {formatCleanerJobEarningsLabel(summary.suggested_daily_goal_cents)}
              </Text>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              {(["all", "pending", "paid"] as Filter[]).map((f) => {
                const selected = filter === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`min-h-10 flex-1 items-center justify-center rounded-xl border px-2 ${
                      selected ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold capitalize ${
                        selected ? "text-brand-600" : "text-ink-muted"
                      }`}
                    >
                      {f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-2 mt-4 text-overline font-semibold uppercase tracking-wide text-ink-muted">
              Payment history
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No earnings yet"
            message="Completed jobs will show here with pending, eligible, and paid amounts."
            icon="wallet-outline"
          />
        }
        renderItem={({ item }) => (
          <EarningsRow
            row={item}
            onPress={() => router.push(`/(cleaner)/job/${item.booking_id}`)}
          />
        )}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

function MoneyTile({
  label,
  cents,
  highlight,
}: {
  label: string;
  cents: number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <View
      className={`flex-1 rounded-2xl border px-2.5 py-3 ${
        highlight ? "border-earnings-border bg-earnings-bg" : "border-border bg-surface-card"
      }`}
    >
      <Text className="text-caption text-ink-muted">{label}</Text>
      <Text
        className={`mt-0.5 text-sm font-bold ${highlight ? "text-earnings-fg" : "text-ink"}`}
        numberOfLines={1}
      >
        {formatCleanerJobEarningsLabel(cents)}
      </Text>
    </View>
  );
}

function EarningsRow({
  row,
  onPress,
}: {
  row: CleanerEarningsRowWire;
  onPress: () => void;
}) {
  const status = String(row.payout_status ?? "pending").toLowerCase();
  const tone =
    status === "paid"
      ? "success"
      : status === "eligible"
        ? "info"
        : status === "invalid"
          ? "danger"
          : "warning";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.service}, ${formatCleanerJobEarningsLabel(row.amount_cents)}, ${status}`}
      className="mb-3 rounded-2xl border border-border bg-surface-card px-4 py-3.5 active:opacity-90"
      android_ripple={{ color: colors.surface.muted }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {row.service || "Cleaning"}
          </Text>
          <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
            {row.date ?? "—"} · {row.location || "—"}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="text-base font-bold text-earnings-fg">
            {formatCleanerJobEarningsLabel(row.amount_cents)}
          </Text>
          <StatusBadge label={status} tone={tone} />
        </View>
      </View>
    </Pressable>
  );
}
