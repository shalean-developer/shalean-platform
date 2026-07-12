import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { textStyle } from "@/theme";

type Props = {
  children: ReactNode;
  /** Pinned below the scroll area (e.g. primary CTA) — always visible */
  footer?: ReactNode;
  onBack?: () => void;
};

/** Curved brand header + scroll body + optional sticky footer. */
export function AuthScreenChrome({ children, footer, onBack }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={24} color="#FFFFFF" />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <Image
          source={require("../../assets/images/auth-header.png")}
          style={styles.heroImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.curve} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {footer ? (
          <View style={[styles.footerBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
  },
  header: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingBottom: 20,
    overflow: "hidden",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    alignSelf: "flex-start",
  },
  backLabel: {
    ...textStyle("button"),
    color: "#FFFFFF",
    marginLeft: 2,
  },
  backSpacer: {
    height: 40,
  },
  heroImage: {
    width: "100%",
    height: 100,
    alignSelf: "center",
  },
  curve: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 24,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scroll: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  footerBar: {
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8ece9",
  },
});
