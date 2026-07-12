import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppButton,
  ErrorState,
  LoadingState,
  Screen,
  TextField,
} from "@shalean/mobile-ui";
import {
  useCustomerAddresses,
  useSaveCustomerAddress,
} from "@/hooks/useCustomerAccount";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { colors } from "@/theme";

export default function AddressEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const addressId = (id ?? "").trim();
  const isNew = addressId === "new" || !addressId;

  const listQuery = useCustomerAddresses();
  const saveMutation = useSaveCustomerAddress();

  const existing = useMemo(
    () => (isNew ? null : (listQuery.data ?? []).find((a) => a.id === addressId) ?? null),
    [isNew, listQuery.data, addressId],
  );

  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("Cape Town");
  const [postalCode, setPostalCode] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setLabel(existing.label);
    setLine1(existing.line1);
    setSuburb(existing.suburb);
    setCity(existing.city || "Cape Town");
    setPostalCode(existing.postal_code || "");
    setIsDefault(Boolean(existing.is_default));
  }, [existing]);

  if (!isNew && listQuery.isLoading && !existing) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading address…" />
      </Screen>
    );
  }

  if (!isNew && listQuery.isSuccess && !existing) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Address unavailable"
          message="This address isn’t available. You may not have access, or it was removed."
          onRetry={() => router.replace("/profile/addresses" as never)}
        />
      </Screen>
    );
  }

  async function onSave() {
    setError(null);
    try {
      await saveMutation.mutateAsync({
        id: isNew ? undefined : addressId,
        body: {
          label: label.trim(),
          line1: line1.trim(),
          suburb: suburb.trim(),
          city: city.trim() || "Cape Town",
          postalCode: postalCode.trim(),
          isDefault,
        },
      });
      router.replace("/profile/addresses" as never);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save address."));
    }
  }

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentClassName="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-10 pt-2" keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text className="mb-2 text-caption font-semibold text-brand-600">← Properties</Text>
        </Pressable>
        <Text className="mb-5 text-title text-ink">{isNew ? "Add address" : "Edit address"}</Text>

        <TextField label="Label" value={label} onChangeText={setLabel} placeholder="Home" placeholderTextColor={colors.ink.muted} />
        <View className="h-3" />
        <TextField label="Street address" value={line1} onChangeText={setLine1} />
        <View className="h-3" />
        <TextField label="Suburb" value={suburb} onChangeText={setSuburb} />
        <View className="h-3" />
        <TextField label="City" value={city} onChangeText={setCity} />
        <View className="h-3" />
        <TextField label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />

        <View className="mt-5 mb-4 flex-row items-center justify-between rounded-xl border border-border bg-surface-card px-4 py-3">
          <Text className="text-body font-medium text-ink">Default address</Text>
          <Switch value={isDefault} onValueChange={setIsDefault} />
        </View>

        {error ? <Text className="mb-3 text-caption text-danger">{error}</Text> : null}

        <AppButton
          label="Save address"
          onPress={() => void onSave()}
          loading={saveMutation.isPending}
          disabled={saveMutation.isPending}
        />
      </ScrollView>
    </Screen>
  );
}
