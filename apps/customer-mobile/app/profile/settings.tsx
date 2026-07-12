import { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Application from "expo-application";
import * as WebBrowser from "expo-web-browser";
import {
  AppButton,
  ListRow,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { APP_BUILD_NUMBER, APP_VERSION } from "@/constants/appMeta";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  CUSTOMER_SUPPORT_WHATSAPP_URL,
} from "@/constants/support";
import { checkForCustomerAppUpdate } from "@/lib/updates/checkForCustomerAppUpdate";

async function openUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const nativeBuild =
    Application.nativeBuildVersion?.trim() || APP_BUILD_NUMBER || "—";

  async function onCheckUpdates() {
    setCheckingUpdate(true);
    try {
      const result = await checkForCustomerAppUpdate({ apply: true });
      if (result.status === "up_to_date" || result.status === "unavailable") {
        Alert.alert("Updates", result.message);
      } else if (result.status === "error") {
        Alert.alert("Updates", result.message);
      }
      // "available" with apply reloads the app — no alert needed
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <Screen scroll edges={["top", "bottom"]} contentClassName="px-4 pb-10 pt-2">
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Profile</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Settings</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Support, legal, and app updates for store builds.
      </Text>

      <SectionCard title="Support" flush className="mb-4 overflow-hidden p-0">
        <ListRow
          label="WhatsApp"
          onPress={() => void Linking.openURL(CUSTOMER_SUPPORT_WHATSAPP_URL)}
        />
        <ListRow
          label="Email"
          value={CUSTOMER_SUPPORT_EMAIL}
          onPress={() => void Linking.openURL(`mailto:${CUSTOMER_SUPPORT_EMAIL}`)}
        />
        <ListRow
          label="Call"
          onPress={() => void Linking.openURL(CUSTOMER_SUPPORT_TELEPHONE_TEL)}
        />
      </SectionCard>

      <SectionCard title="Legal" flush className="mb-4 overflow-hidden p-0">
        <ListRow
          label="Privacy Policy"
          onPress={() => void openUrl(PRIVACY_POLICY_URL)}
        />
        <ListRow
          label="Terms of Service"
          onPress={() => void openUrl(TERMS_OF_SERVICE_URL)}
        />
      </SectionCard>

      <SectionCard title="App" className="mb-4">
        <Text className="text-body text-ink">
          Version {APP_VERSION} ({nativeBuild})
        </Text>
        <View className="mt-3">
          <AppButton
            label="Check for updates"
            variant="secondary"
            loading={checkingUpdate}
            disabled={checkingUpdate}
            onPress={() => void onCheckUpdates()}
          />
        </View>
      </SectionCard>
    </Screen>
  );
}
