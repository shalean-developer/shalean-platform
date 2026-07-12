import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, ErrorState, LoadingState, Screen, TextField } from "@shalean/mobile-ui";
import { useCustomerProfile, usePatchCustomerProfile } from "@/hooks/useCustomerAccount";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { colors } from "@/theme";

const CONTACT_OPTIONS = [
  { value: "whatsapp" as const, label: "WhatsApp" },
  { value: "email" as const, label: "Email" },
  { value: "phone" as const, label: "SMS / phone" },
];

export default function ProfileEditScreen() {
  const router = useRouter();
  const profileQuery = useCustomerProfile();
  const patchMutation = usePatchCustomerProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [preferredContact, setPreferredContact] = useState<"whatsapp" | "email" | "phone" | null>(
    null,
  );
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setFullName(p.fullName ?? "");
    setPhone(p.phone ?? "");
    setWhatsapp(p.whatsapp ?? "");
    setPreferredContact(p.preferredContact);
    setDateOfBirth(p.dateOfBirth ?? "");
  }, [profileQuery.data]);

  if (profileQuery.isLoading && !profileQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading profile…" />
      </Screen>
    );
  }

  if (profileQuery.isError && !profileQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load profile"
          message={friendlyErrorMessage(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
        />
      </Screen>
    );
  }

  async function onSave() {
    setError(null);
    try {
      await patchMutation.mutateAsync({
        fullName: fullName.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim(),
        preferredContact: preferredContact ?? undefined,
        dateOfBirth: dateOfBirth.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save profile."));
    }
  }

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentClassName="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-10 pt-2" keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text className="mb-2 text-caption font-semibold text-brand-600">← Profile</Text>
        </Pressable>
        <Text className="mb-1 text-title text-ink">Edit profile</Text>
        <Text className="mb-5 text-body text-ink-muted">
          Email stays on your login. Password reset is available from Profile.
        </Text>

        <TextField label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        <View className="h-3" />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View className="h-3" />
        <TextField
          label="WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
        />
        <View className="h-3" />
        <TextField
          label="Date of birth (YYYY-MM-DD)"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1990-01-15"
          placeholderTextColor={colors.ink.muted}
        />

        <Text className="mb-2 mt-5 text-label font-medium tracking-wide text-ink-muted">
          Preferred contact
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {CONTACT_OPTIONS.map((opt) => {
            const selected = preferredContact === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPreferredContact(opt.value)}
                className={`rounded-xl border px-3 py-2 ${
                  selected ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <Text className={`text-caption font-semibold ${selected ? "text-brand-600" : "text-ink"}`}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text className="mb-3 text-caption text-danger">{error}</Text> : null}

        <AppButton
          label="Save profile"
          onPress={() => void onSave()}
          loading={patchMutation.isPending}
          disabled={patchMutation.isPending}
        />
      </ScrollView>
    </Screen>
  );
}
