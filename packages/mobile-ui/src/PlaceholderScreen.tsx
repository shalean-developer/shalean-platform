import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  title: string;
  subtitle?: string;
  routeHint?: string;
};

/** Scaffold / coming-soon placeholder. */
export function PlaceholderScreen({ title, subtitle, routeHint }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 text-center text-label font-medium tracking-wide text-brand-500">
          Coming soon
        </Text>
        <Text className="mb-3 text-center text-display text-ink">{title}</Text>
        {subtitle ? <Text className="mb-4 text-center text-body text-ink-muted">{subtitle}</Text> : null}
        {routeHint ? (
          <Text className="text-center text-caption text-ink-muted">Route: {routeHint}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
