import { useCallback, useMemo } from "react";
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

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(date);
}

function currentMonthPaidCents(rows: CleanerEarningsRowWire[]): number {
  const now = new Date();
  return rows.reduce((sum, row) => {
    if (String(row.payout_status).toLowerCase() !== "paid" || !row.payout_paid_at) return sum;
    const paidAt = new Date(row.payout_paid_at);
    if (Number.isNaN(paidAt.getTime())) return sum;
    if (paidAt.getFullYear() !== now.getFullYear() || paidAt.getMonth() !== now.getMonth()) return sum;
    return sum + Math.max(0, row.amount_cents ?? 0);
  }, 0);
}

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

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const recentEarnings = useMemo(() => rows.slice(0, 5), [rows]);
  const paymentHistory = useMemo(
    () => rows.filter((row) => String(row.payout_status).toLowerCase() === "paid").slice(0, 20),
    [rows],
  );

  const summary = data?.summary;
  const todayCents = summary?.today_cents ?? dashboard?.summary?.today_cents ?? 0;
  const weekCents = summary?.week_cents ?? 0;
  const monthCents = summary?.month_cents ?? 0;
  const pendingCents = summary?.pending_cents ?? data?.total_pending ?? 0;
  const eligibleCents = summary?.eligible_cents ?? data?.total_approved ?? 0;
  const paidThisMonthCents = useMemo(() => currentMonthPaidCents(rows), [rows]);
  const lifetimeCents = data?.total_all_time ?? data?.total_paid ?? 0;
  const completedBookings = rows.length;

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
        data={paymentHistory}
        keyExtractor={(item) => `${item.booking_id}:${item.payout_run_id ?? item.payout_paid_at ?? "paid"}`}
        contentContainerClassName="grow px-4 pb-10 pt-2"
        refreshControl={
          <RefreshControl refreshing={isRefetching || isFetching} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="text-title text-ink" accessibilityRole="header">Earnings</Text>
            <Text className="mt-1 text-sm text-ink-muted">Your income overview.</Text>

            <SectionHeading label="Earnings summary" />
            <View className="flex-row gap-2">
              <MoneyTile label="Today's earnings" cents={todayCents} highlight />
              <MoneyTile label="This week" cents={weekCents} />
              <MoneyTile label="This month" cents={monthCents} />
            </View>

            <SectionHeading label="Payout summary" />
            <SectionCard>
              <PayoutSummaryRow label="Pending approval" cents={pendingCents} tone="warning" />
              <Divider />
              <PayoutSummaryRow label="Eligible for payout" cents={eligibleCents} tone="info" />
              <Divider />
              <PayoutSummaryRow label="Paid this month" cents={paidThisMonthCents} tone="success" />
            </SectionCard>

            {data?.paymentDetails?.missingBankDetails ? (
              <SectionCard className="mt-3">
                <Text className="text-sm font-semibold text-status-warning-fg">Bank details needed</Text>
                <Text className="mt-1 text-sm text-ink-muted">
                  Add payout details in the cleaner portal so we can pay you.
                </Text>
              </SectionCard>
            ) : null}

            <SectionHeading label="Recent earnings" />
            {recentEarnings.length > 0 ? (
              <SectionCard className="overflow-hidden p-0">
                {recentEarnings.map((row, index) => (
                  <View key={row.booking_id}>
                    <RecentEarningsRow
                      row={row}
                      onPress={() => router.push(`/(cleaner)/job/${row.booking_id}`)}
                    />
                    {index < recentEarnings.length - 1 ? <Divider /> : null}
                  </View>
                ))}
              </SectionCard>
            ) : (
              <EmptyCard title="No recent earnings" message="Completed jobs will appear here." />
            )}

            <SectionHeading label="Payment history" />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No payment history"
            message="Completed payout batches will appear here."
            icon="wallet-outline"
          />
        }
        renderItem={({ item }) => (
          <PaymentHistoryRow
            row={item}
            onPress={() => router.push(`/(cleaner)/job/${item.booking_id}`)}
          />
        )}
        ListFooterComponent={
          <View>
            <SectionHeading label="Performance summary" />
            <View className="flex-row gap-2">
              <MoneyTile label="Total lifetime earnings" cents={lifetimeCents} />
              <MetricTile label="Bookings completed" value={completedBookings.toLocaleString("en-ZA")} />
            </View>
          </View>
        }
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <Text className="mb-2 mt-5 text-label font-semibold uppercase tracking-wide text-ink-muted">
      {label}
    </Text>
  );
}

function Divider() {
  return <View className="h-px bg-border" />;
}

function MoneyTile({ label, cents, highlight }: { label: string; cents: number; highlight?: boolean }) {
  return (
    <View className={`flex-1 rounded-2xl border px-3 py-4 ${highlight ? "border-earnings-border bg-earnings-bg" : "border-border bg-surface-card"}`}>
      <Text className="text-caption text-ink-muted" numberOfLines={2}>{label}</Text>
      <Text className={`mt-1 text-base font-bold ${highlight ? "text-earnings-fg" : "text-ink"}`} numberOfLines={1}>
        {formatCleanerJobEarningsLabel(cents)}
      </Text>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-surface-card px-3 py-4">
      <Text className="text-caption text-ink-muted" numberOfLines={2}>{label}</Text>
      <Text className="mt-1 text-base font-bold text-ink" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PayoutSummaryRow({ label, cents, tone }: { label: string; cents: number; tone: "warning" | "info" | "success" }) {
  const toneClass = tone === "success" ? "text-status-success-fg" : tone === "warning" ? "text-status-warning-fg" : "text-brand-600";
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <Text className="flex-1 text-sm font-medium text-ink">{label}</Text>
      <Text className={`text-base font-bold ${toneClass}`}>{formatCleanerJobEarningsLabel(cents)}</Text>
    </View>
  );
}

function RecentEarningsRow({ row, onPress }: { row: CleanerEarningsRowWire; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.service}, ${formatDateLabel(row.date)}, ${formatCleanerJobEarningsLabel(row.amount_cents)}`}
      className="flex-row items-center justify-between gap-3 px-4 py-3.5 active:opacity-90"
      android_ripple={{ color: colors.surface.muted }}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-ink" numberOfLines={1}>{row.service || "Cleaning"}</Text>
        <Text className="mt-0.5 text-sm text-ink-muted">{formatDateLabel(row.date)}</Text>
      </View>
      <Text className="text-base font-bold text-earnings-fg">{formatCleanerJobEarningsLabel(row.amount_cents)}</Text>
    </Pressable>
  );
}

function PaymentHistoryRow({ row, onPress }: { row: CleanerEarningsRowWire; onPress: () => void }) {
  const batchLabel = row.payout_run_id ? `Batch ${row.payout_run_id.slice(0, 8)}` : "Payout";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${batchLabel}, ${formatCleanerJobEarningsLabel(row.amount_cents)}, paid`}
      className="mb-3 rounded-2xl border border-border bg-surface-card px-4 py-3.5 active:opacity-90"
      android_ripple={{ color: colors.surface.muted }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>{batchLabel}</Text>
          <Text className="mt-0.5 text-sm text-ink-muted">{formatDateLabel(row.payout_paid_at?.slice(0, 10) ?? row.date)}</Text>
        </View>
        <View className="items-end gap-1">
          <Text className="text-base font-bold text-earnings-fg">{formatCleanerJobEarningsLabel(row.amount_cents)}</Text>
          <StatusBadge label="paid" tone="success" />
        </View>
      </View>
    </Pressable>
  );
}

function EmptyCard({ title, message }: { title: string; message: string }) {
  return (
    <View className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-6 text-center">
      <Text className="font-semibold text-ink">{title}</Text>
      <Text className="mt-1 text-sm text-ink-muted">{message}</Text>
    </View>
  );
}
