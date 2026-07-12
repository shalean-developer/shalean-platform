import { Alert, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import {
  useCustomerAddresses,
  useDeleteCustomerAddress,
} from "@/hooks/useCustomerAccount";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";

export default function AddressesListScreen() {
  const router = useRouter();
  const listQuery = useCustomerAddresses();
  const deleteMutation = useDeleteCustomerAddress();

  function confirmDelete(id: string, label: string) {
    Alert.alert("Delete address?", `Remove “${label}” from your saved properties?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteMutation.mutateAsync(id);
            } catch (e) {
              Alert.alert("Couldn’t delete", friendlyErrorMessage(e));
            }
          })();
        },
      },
    ]);
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading addresses…" />
      </Screen>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load addresses"
          message={friendlyErrorMessage(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      </Screen>
    );
  }

  const addresses = listQuery.data ?? [];

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={listQuery.isRefetching && !listQuery.isLoading}
          onRefresh={() => void listQuery.refetch()}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Profile</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Properties</Text>
      <Text className="mb-5 text-body text-ink-muted">Saved addresses for faster booking.</Text>

      <AppButton
        label="Add address"
        className="mb-4"
        onPress={() => router.push("/profile/addresses/new" as never)}
      />

      {addresses.length === 0 ? (
        <EmptyState title="No saved addresses" message="Add a property to reuse it when you book." />
      ) : (
        <View className="gap-3">
          {addresses.map((a) => (
            <SectionCard key={a.id}>
              <View className="mb-1 flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-title text-ink">{a.label}</Text>
                {a.is_default ? (
                  <Text className="text-caption font-semibold text-brand-600">Default</Text>
                ) : null}
              </View>
              <Text className="text-body text-ink-muted">
                {[a.line1, a.suburb, a.city, a.postal_code].filter(Boolean).join(", ")}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <AppButton
                  label="Edit"
                  variant="secondary"
                  className="flex-1"
                  onPress={() => router.push(`/profile/addresses/${a.id}` as never)}
                />
                <AppButton
                  label="Delete"
                  variant="danger"
                  className="flex-1"
                  onPress={() => confirmDelete(a.id, a.label)}
                />
              </View>
            </SectionCard>
          ))}
        </View>
      )}
    </Screen>
  );
}
