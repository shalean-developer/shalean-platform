import { useCallback } from "react";
import { useRouter } from "expo-router";
import {
  Dimensions,
  Image,
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";
import { colors, textStyle } from "@/theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.46);

const TRACK_HEIGHT = 64;
const TRACK_PAD = 5;
const THUMB_HEIGHT = TRACK_HEIGHT - TRACK_PAD * 2;
const CHEVRON_ZONE = 44;

const WELCOME = {
  hero: colors.brand[500],
  panel: colors.brand[900],
  /** Same relationship as mock: thumb matches panel */
  thumb: colors.brand[900],
  track: "#FFFFFF",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.82)",
  chevron: "#1F2937",
} as const;

async function openUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

/** White track + dark “Get Started” thumb + >> — matches onboarding mock. */
function GetStartedSlide({ onComplete }: { onComplete: () => void }) {
  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const trackW = useSharedValue(0);
  const thumbW = useSharedValue(0);
  const busy = useSharedValue(false);

  const finish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const recomputeMax = () => {
    "worklet";
    return Math.max(0, trackW.value - thumbW.value - TRACK_PAD * 2 - CHEVRON_ZONE);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onBegin(() => {
      dragStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      if (busy.value) return;
      const max = recomputeMax();
      if (max <= 0) return;
      translateX.value = Math.min(Math.max(0, dragStartX.value + e.translationX), max);
    })
    .onEnd(() => {
      if (busy.value) return;
      const max = recomputeMax();
      const success = max > 0 && translateX.value >= max * 0.65;
      // Always snap the thumb back to the start
      translateX.value = withSpring(0, { damping: 15, stiffness: 220 });
      if (success) {
        busy.value = true;
        runOnJS(finish)();
        busy.value = false;
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (busy.value) return;
    translateX.value = withSpring(0, { damping: 15, stiffness: 220 });
    runOnJS(finish)();
  });

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={styles.ctaTrack}
      onLayout={(e: LayoutChangeEvent) => {
        trackW.value = e.nativeEvent.layout.width;
      }}
      accessibilityRole="button"
      accessibilityLabel="Get started. Slide or tap to continue"
    >
      <View style={styles.ctaChevronWrap} pointerEvents="none">
        <Feather name="chevrons-right" size={22} color={WELCOME.chevron} />
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.ctaThumb, thumbStyle]}
          onLayout={(e: LayoutChangeEvent) => {
            thumbW.value = e.nativeEvent.layout.width;
          }}
        >
          <Text style={styles.ctaLabel}>Get Started</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16) + 12;
  const heroHeight = HERO_HEIGHT + insets.top;

  return (
    <View style={[styles.root, { backgroundColor: WELCOME.hero }]}>
      <StatusBar style="light" />

      <View
        style={[
          styles.hero,
          {
            height: heroHeight,
            paddingTop: insets.top,
            backgroundColor: WELCOME.hero,
          },
        ]}
      >
        <Image
          source={require("../../assets/images/welcome-hero.png")}
          style={styles.heroImage}
          resizeMode="contain"
          accessibilityLabel="Professional Shalean cleaner"
        />
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: WELCOME.panel,
            paddingBottom: bottomPad,
            paddingTop: 28,
          },
        ]}
      >
        <Text style={styles.heroTitle}>Trusted Home Services at Your Fingertips</Text>
        <Text style={styles.heroSubtitle}>
          Book verified professionals for home cleaning anytime, anywhere.
        </Text>

        <GetStartedSlide onComplete={() => router.push("/(auth)/signup")} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log in"
          onPress={() => router.push("/(auth)/login")}
          style={styles.loginHit}
        >
          <Text style={styles.loginLabel}>Already have an account? Log in</Text>
        </Pressable>

        <Text style={styles.legal}>
          By continuing, you agree to our{" "}
          <Text style={styles.legalLink} onPress={() => void openUrl(TERMS_OF_SERVICE_URL)}>
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text style={styles.legalLink} onPress={() => void openUrl(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hero: {
    width: "100%",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroImage: {
    width: "100%",
    flex: 1,
  },
  panel: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
  },
  heroTitle: {
    ...textStyle("hero"),
    color: WELCOME.text,
    textAlign: "center",
  },
  heroSubtitle: {
    ...textStyle("secondary"),
    marginTop: 14,
    marginBottom: 28,
    color: WELCOME.textMuted,
    textAlign: "center",
  },
  ctaTrack: {
    alignSelf: "stretch",
    height: TRACK_HEIGHT,
    borderRadius: 999,
    backgroundColor: WELCOME.track,
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaThumb: {
    position: "absolute",
    left: TRACK_PAD,
    top: TRACK_PAD,
    height: THUMB_HEIGHT,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: WELCOME.thumb,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  ctaLabel: {
    ...textStyle("button"),
    color: WELCOME.text,
    includeFontPadding: false,
  },
  ctaChevronWrap: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    width: CHEVRON_ZONE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  loginHit: {
    marginTop: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  loginLabel: {
    ...textStyle("secondary"),
    color: WELCOME.textMuted,
  },
  legal: {
    ...textStyle("label"),
    marginTop: 12,
    color: WELCOME.textMuted,
    textAlign: "center",
  },
  legalLink: {
    color: WELCOME.text,
    fontWeight: "600",
  },
});
