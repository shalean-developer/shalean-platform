import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: true }} />
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <Text className="mb-2 text-title text-ink">Screen not found</Text>
        <Text className="mb-6 text-center text-body text-ink-muted">
          This route is not part of the customer app yet.
        </Text>
        <Link href="/" className="text-body font-semibold text-brand-600">
          Go to start
        </Link>
      </View>
    </>
  );
}
