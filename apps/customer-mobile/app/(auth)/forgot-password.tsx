import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export default function ForgotPasswordScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6 pb-10 pt-6"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="mb-6 min-h-touch justify-center self-start"
        >
          <Text className="text-body font-semibold text-brand-600">Back</Text>
        </Pressable>

        <Text className="mb-2 text-title text-ink">Reset password</Text>
        <Text className="mb-8 text-body text-ink-muted">
          We will email you a secure link. The link opens the Shalean website to set a new password
          (same flow as web).
        </Text>

        <ForgotPasswordForm />
      </ScrollView>
    </SafeAreaView>
  );
}
