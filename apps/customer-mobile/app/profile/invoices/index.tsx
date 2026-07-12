import { Alert, Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { formatZar } from "@/lib/booking/displayPricing";
import { useCustomerInvoices } from "@/hooks/useCustomerAccount";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";

export default function InvoicesListScreen() {
  const router = useRouter();
  const invoicesQuery = useCustomerInvoices();

  if (invoicesQuery.isLoading && !invoicesQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading invoices…" />
      </Screen>
    );
  }

  if (invoicesQuery.isError && !invoicesQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load invoices"
          message={friendlyErrorMessage(invoicesQuery.error)}
          onRetry={() => void invoicesQuery.refetch()}
        />
      </Screen>
    );
  }

  const monthly = invoicesQuery.data?.monthly ?? [];
  const perVisit = invoicesQuery.data?.perVisit ?? [];
  const empty = monthly.length === 0 && perVisit.length === 0;

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={invoicesQuery.isRefetching && !invoicesQuery.isLoading}
          onRefresh={() => void invoicesQuery.refetch()}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Profile</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Payments & invoices</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Monthly statements and paid visit receipts. PDFs open when Zoho sync is available.
      </Text>

      {empty ? (
        <EmptyState title="No invoices yet" message="Paid visits and monthly bills will show up here." />
      ) : null}

      {monthly.length > 0 ? (
        <View className="mb-6">
          <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
            Monthly
          </Text>
          <View className="gap-3">
            {monthly.map((inv) => (
              <SectionCard key={inv.id}>
                <Text className="text-title text-ink">{inv.month}</Text>
                <Text className="mt-1 text-body text-ink-muted">
                  {formatZar(inv.totalAmountCents / 100)} · {inv.status ?? "—"}
                  {inv.isOverdue ? " · Overdue" : ""}
                </Text>
                <View className="mt-3 gap-2">
                  {inv.paymentLink && inv.balanceCents > 0 && !inv.isClosed ? (
                    <AppButton
                      label="Pay balance"
                      onPress={() => void Linking.openURL(inv.paymentLink!)}
                    />
                  ) : null}
                  <AppButton
                    label="View PDF"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/profile/invoice-pdf",
                        params: { kind: "monthly", id: inv.id },
                      } as never)
                    }
                  />
                </View>
              </SectionCard>
            ))}
          </View>
        </View>
      ) : null}

      {perVisit.length > 0 ? (
        <View>
          <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
            Per visit
          </Text>
          <View className="gap-3">
            {perVisit.map((inv) => (
              <SectionCard key={inv.bookingId}>
                <Text className="text-title text-ink">{inv.serviceName}</Text>
                <Text className="mt-1 text-body text-ink-muted">
                  {inv.date} · {formatZar(inv.amountZar)}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <AppButton
                    label="Booking"
                    variant="secondary"
                    className="flex-1"
                    onPress={() => router.push(`/bookings/${inv.bookingId}` as never)}
                  />
                  <AppButton
                    label="PDF"
                    variant="secondary"
                    className="flex-1"
                    onPress={() => {
                      if (!inv.hasPdf) {
                        Alert.alert(
                          "PDF not ready",
                          "This visit doesn’t have a synced invoice PDF yet.",
                        );
                        return;
                      }
                      router.push({
                        pathname: "/profile/invoice-pdf",
                        params: { kind: "booking", id: inv.bookingId },
                      } as never);
                    }}
                  />
                </View>
              </SectionCard>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
