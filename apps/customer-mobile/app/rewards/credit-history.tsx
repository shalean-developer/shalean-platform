import { useRouter } from "expo-router";
import { Pressable, RefreshControl, Text, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { formatZar } from "@/lib/booking/displayPricing";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useCreditHistory } from "@/hooks/useCustomerRewards";

function typeLabel(type: string): string {
  switch (type) {
    case "earn":
      return "Earned";
    case "spend":
      return "Used";
    case "reverse":
      return "Reversed";
    case "expire":
      return "Expired";
    case "admin_adjust":
      return "Adjustment";
    default:
      return type;
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CreditHistoryScreen() {
  const router = useRouter();
  const historyQuery = useCreditHistory();

  if (historyQuery.isLoading && !historyQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading history…" />
      </Screen>
    );
  }

  if (historyQuery.isError && !historyQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load history"
          message={friendlyErrorMessage(historyQuery.error)}
          onRetry={() => void historyQuery.refetch()}
        />
      </Screen>
    );
  }

  const rows = historyQuery.data ?? [];

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={historyQuery.isRefetching && !historyQuery.isLoading}
          onRefresh={() => void historyQuery.refetch()}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Rewards</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Credit history</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Ledger of cleaning credit earned and spent. Balances are authoritative on the server.
      </Text>

      {rows.length === 0 ? (
        <EmptyState title="No transactions yet" message="Credit from referrals will show here." />
      ) : (
        <View className="gap-3">
          {rows.map((row) => (
            <SectionCard key={row.id}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-body font-semibold text-ink">{typeLabel(row.type)}</Text>
                  {row.note ? (
                    <Text className="mt-0.5 text-caption text-ink-muted" numberOfLines={2}>
                      {row.note}
                    </Text>
                  ) : null}
                  <Text className="mt-1 text-caption text-ink-muted">{formatWhen(row.createdAt)}</Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`text-body font-semibold ${
                      row.amountZar >= 0 ? "text-status-success-fg" : "text-ink"
                    }`}
                  >
                    {row.amountZar >= 0 ? "+" : ""}
                    {formatZar(row.amountZar)}
                  </Text>
                  <Text className="mt-0.5 text-caption text-ink-muted">
                    Bal {formatZar(row.balanceAfterZar)}
                  </Text>
                </View>
              </View>
            </SectionCard>
          ))}
        </View>
      )}
    </Screen>
  );
}
