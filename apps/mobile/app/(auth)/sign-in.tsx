import { Redirect, useRouter } from "expo-router";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SignInForm } from "@/features/auth/SignInForm";
import { useAuth } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/ui/StateViews";
import { API_UPSTREAM_URL } from "@/constants/config";

export default function SignInScreen() {
  const { status } = useAuth();
  const router = useRouter();

  if (status === "loading") {
    return <LoadingState label="Checking session…" />;
  }

  if (status === "signedIn") {
    return <Redirect href="/(cleaner)/(tabs)" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center px-6">
        <View className="mb-8 items-center">
          <Image
            source={require("../../assets/images/shalean-logo.png")}
            accessibilityLabel="Shalean"
            style={{ width: 160, height: 48, marginBottom: 20 }}
            resizeMode="contain"
          />
          <Text className="text-center text-3xl font-bold text-ink" accessibilityRole="header">
            Shalean Cleaner
          </Text>
          <Text className="mt-2 text-center text-base text-ink-muted">
            Sign in to see today's jobs and manage your workday.
          </Text>
        </View>
        <SignInForm onSuccess={() => router.replace("/(cleaner)/(tabs)")} />
        {API_UPSTREAM_URL ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Apply to become a Shalean cleaner"
            onPress={() => void Linking.openURL(API_UPSTREAM_URL.replace(/\/$/, "") + "/cleaner/apply")}
            className="mt-6 items-center rounded-xl border border-border px-4 py-4"
          >
            <Text className="text-center text-base font-semibold text-ink">New to Shalean? Apply as a cleaner</Text>
            <Text className="mt-1 text-center text-sm text-ink-muted">
              Applications are reviewed before cleaner access is activated.
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
