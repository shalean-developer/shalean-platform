import { Redirect, useRouter } from "expo-router";
import { Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SignInForm } from "@/features/auth/SignInForm";
import { useAuth } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/ui/StateViews";

export default function SignInScreen() {
  const { status } = useAuth();
  const router = useRouter();

  if (status === "loading") {
    return <LoadingState label="Checking session…" />;
  }

  if (status === "signedIn") {
    return <Redirect href="/(cleaner)" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center px-6">
        <View className="mb-8 items-center">
          <Image
            source={require("../../assets/images/shalean-logo.png")}
            accessibilityLabel="Shalean"
            className="mb-5 h-14 w-40"
            resizeMode="contain"
          />
          <Text className="text-center text-3xl font-bold text-ink" accessibilityRole="header">
            Shalean Cleaner
          </Text>
          <Text className="mt-2 text-center text-base text-ink-muted">
            Sign in with your phone number and password.
          </Text>
        </View>
        <SignInForm onSuccess={() => router.replace("/(cleaner)")} />
      </View>
    </SafeAreaView>
  );
}
