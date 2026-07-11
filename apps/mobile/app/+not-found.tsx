import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { AppButton } from "@/components/ui/AppButton";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: true }} />
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <Text className="mb-2 text-xl font-bold text-ink">Screen not found</Text>
        <Text className="mb-6 text-center text-ink-muted">
          This screen does not exist. Return to your jobs list to continue.
        </Text>
        <AppButton
          label="Go to today's jobs"
          onPress={() => router.replace("/(cleaner)/(tabs)")}
          className="min-w-[200px]"
        />
      </View>
    </>
  );
}
