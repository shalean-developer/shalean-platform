import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme";

/** Entry: restore session → cleaner home or sign-in. */
export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  if (status === "signedIn") {
    return <Redirect href="/(cleaner)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
