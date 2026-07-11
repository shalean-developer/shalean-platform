import { Linking, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  CLEANER_SUPPORT_EMAIL,
  CLEANER_SUPPORT_PHONE_DISPLAY,
  CLEANER_SUPPORT_WHATSAPP_DISPLAY,
  cleanerSupportMailtoHref,
  cleanerSupportTelHref,
  cleanerSupportWhatsAppHref,
} from "@/constants/support";

/** Support hub — contacts, help, feedback, emergency. */
export default function SupportScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="gap-3 px-4 pb-10 pt-2">
        <SectionCard>
          <Text className="text-heading text-ink" accessibilityRole="header">
            Need help?
          </Text>
          <Text className="mt-2 text-body text-ink-muted">
            Contact Shalean ops for job access, safety, scheduling, or payment issues.
          </Text>
          <AppButton
            label="WhatsApp ops"
            onPress={() =>
              void Linking.openURL(
                cleanerSupportWhatsAppHref("Hi Shalean, I need help with a cleaner job."),
              )
            }
            className="mt-4"
          />
          <AppButton
            label={`Call ${CLEANER_SUPPORT_PHONE_DISPLAY}`}
            variant="secondary"
            onPress={() => void Linking.openURL(cleanerSupportTelHref())}
            className="mt-2"
          />
          <AppButton
            label="Email support"
            variant="ghost"
            onPress={() =>
              void Linking.openURL(cleanerSupportMailtoHref("Cleaner app support"))
            }
            className="mt-1"
          />
        </SectionCard>

        <SectionCard flush className="overflow-hidden p-0">
          <ListRow
            label="Help centre"
            value="Guides & FAQs"
            icon="book-outline"
            onPress={() => router.push("/(cleaner)/help" as Href)}
          />
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Send feedback"
              value="App ideas & issues"
              icon="chatbubble-ellipses-outline"
              onPress={() => router.push("/(cleaner)/feedback" as Href)}
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Emergency support"
              value={CLEANER_SUPPORT_WHATSAPP_DISPLAY}
              icon="alert-circle-outline"
              onPress={() =>
                void Linking.openURL(
                  cleanerSupportWhatsAppHref("EMERGENCY: I need urgent help on a job."),
                )
              }
            />
          </View>
          <View className="mx-4 border-t border-border">
            <ListRow
              label="Email"
              value={CLEANER_SUPPORT_EMAIL}
              icon="mail-outline"
              showChevron={false}
            />
          </View>
        </SectionCard>
      </ScrollView>
    </View>
  );
}
