import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

type ToastTone = "info" | "success" | "warning" | "danger";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyle: Record<ToastTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { bg: colors.status.info.bg, fg: colors.status.info.fg, icon: "information-circle" },
  success: { bg: colors.status.success.bg, fg: colors.status.success.fg, icon: "checkmark-circle" },
  warning: { bg: colors.status.warning.bg, fg: colors.status.warning.fg, icon: "warning" },
  danger: { bg: colors.status.danger.bg, fg: colors.status.danger.fg, icon: "alert-circle" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: String(Date.now()), message, tone });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, 3200);
    },
    [hide, opacity],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);
  const style = toast ? toneStyle[toast.tone] : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && style ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: Math.max(insets.bottom, 12) + 56,
            opacity,
            zIndex: 1000,
          }}
        >
          <Pressable
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="flex-row items-center gap-3 rounded-2xl border border-border px-4 py-3.5"
            style={{ backgroundColor: style.bg }}
          >
            <Ionicons name={style.icon} size={22} color={style.fg} />
            <Text className="flex-1 text-sm font-medium" style={{ color: style.fg }}>
              {toast.message}
            </Text>
            <View>
              <Ionicons name="close" size={18} color={style.fg} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
