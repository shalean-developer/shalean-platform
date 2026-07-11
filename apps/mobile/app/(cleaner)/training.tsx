import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { TRAINING_MODULES } from "@/constants/helpContent";

/** Lightweight training tips — full LMS can land later. */
export default function TrainingScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="gap-3 px-4 pb-10 pt-2">
        <Text className="text-sm text-ink-muted">
          Quick modules to stay reliable and deliver great cleans. Deeper training content will expand
          here over time.
        </Text>
        {TRAINING_MODULES.map((mod, index) => (
          <SectionCard key={mod.id} title={`Module ${index + 1}`}>
            <Text className="text-base font-semibold text-ink">{mod.title}</Text>
            <Text className="mt-2 text-sm leading-5 text-ink-muted">{mod.summary}</Text>
          </SectionCard>
        ))}
        <AppButton
          label="Open help centre"
          variant="secondary"
          onPress={() => router.push("/(cleaner)/help" as Href)}
        />
      </ScrollView>
    </View>
  );
}
