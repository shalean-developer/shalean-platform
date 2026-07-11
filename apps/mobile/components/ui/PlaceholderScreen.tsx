import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  title: string;
  subtitle?: string;
  routeHint?: string;
};

/** Shared placeholder chrome for scaffold screens — not a product UI. */
export function PlaceholderScreen({ title, subtitle, routeHint }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-brand-500">
          Placeholder
        </Text>
        <Text className="mb-3 text-center text-3xl font-bold text-ink">{title}</Text>
        {subtitle ? <Text className="mb-4 text-center text-base text-ink-muted">{subtitle}</Text> : null}
        {routeHint ? (
          <Text className="text-center text-sm text-ink-muted">Route: {routeHint}</Text>
        ) : null}
        <Text className="mt-8 text-center text-sm text-ink-muted">
          Feature implementation has not started. Shared packages are wired for future work.
        </Text>
      </View>
    </SafeAreaView>
  );
}
