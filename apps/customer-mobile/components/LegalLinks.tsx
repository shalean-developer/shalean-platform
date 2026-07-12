import { Linking, Pressable, StyleSheet, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";
import { textStyle } from "@/theme";

async function openUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

/** Auth / signup footer — StyleSheet only (no NativeWind). */
export function AuthLegalFooter() {
  return (
    <Text style={styles.wrap}>
      By continuing, you agree to our{" "}
      <Text style={styles.link} onPress={() => void openUrl(TERMS_OF_SERVICE_URL)} accessibilityRole="link">
        Terms of Service
      </Text>{" "}
      and{" "}
      <Text style={styles.link} onPress={() => void openUrl(PRIVACY_POLICY_URL)} accessibilityRole="link">
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

export function LegalLinkRow({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
  return (
    <Pressable
      onPress={() => void openUrl(url)}
      accessibilityRole="link"
      style={styles.row}
    >
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...textStyle("label"),
    marginTop: 16,
    textAlign: "center",
    color: "#5b6b63",
  },
  link: {
    fontWeight: "600",
    color: "#2563eb",
  },
  row: {
    minHeight: 48,
    justifyContent: "center",
  },
  rowLabel: {
    ...textStyle("button"),
    color: "#2563eb",
  },
});
