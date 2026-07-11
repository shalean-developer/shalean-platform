import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { HELP_ARTICLES } from "@/constants/helpContent";
import { colors } from "@/theme";

/** Static help centre for cleaners. */
export default function HelpCentreScreen() {
  const [openId, setOpenId] = useState<string | null>(HELP_ARTICLES[0]?.id ?? null);

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="gap-3 px-4 pb-10 pt-2">
        <Text className="text-sm text-ink-muted">
          Short guides for the most common cleaner workflows.
        </Text>
        {HELP_ARTICLES.map((article) => {
          const open = openId === article.id;
          return (
            <SectionCard key={article.id} className="overflow-hidden p-0">
              <Pressable
                onPress={() => setOpenId(open ? null : article.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="min-h-touch justify-center px-4 py-3.5 active:opacity-80"
              >
                <Text className="text-base font-semibold text-ink">{article.title}</Text>
              </Pressable>
              {open ? (
                <View className="border-t border-border px-4 pb-4 pt-2">
                  <Text className="text-sm leading-5 text-ink-muted">{article.body}</Text>
                </View>
              ) : null}
            </SectionCard>
          );
        })}
        <Text className="text-caption text-ink-subtle" style={{ color: colors.ink.subtle }}>
          Still stuck? Open Support to message ops.
        </Text>
      </ScrollView>
    </View>
  );
}
