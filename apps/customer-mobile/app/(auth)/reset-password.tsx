import { useRouter } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@shalean/mobile-ui";
import { API_UPSTREAM_URL } from "@/constants/config";

/**
 * In-app reset landing — password recovery emails currently redirect to the web
 * `/auth/reset-password` page (server-owned). This screen documents that and
 * deep-links users to the website when needed.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const webReset = `${API_UPSTREAM_URL.replace(/\/$/, "")}/auth/reset-password`;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-3 text-title text-ink">Set a new password</Text>
        <Text className="mb-8 text-body text-ink-muted">
          Use the reset link from your email. It opens securely in your browser. After updating your
          password, return here to log in.
        </Text>
        <AppButton
          label="Open reset page"
          onPress={() => {
            void Linking.openURL(webReset);
          }}
          className="mb-3"
        />
        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          accessibilityRole="button"
          className="min-h-touch items-center justify-center"
        >
          <Text className="text-body font-semibold text-brand-600">Back to log in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
