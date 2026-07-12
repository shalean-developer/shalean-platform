import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildPaystackInlineHtml } from "@/features/payment/buildPaystackInlineHtml";
import type { PaystackInlineParams, PaystackWebViewMessage } from "@/features/payment/types";

type Props = {
  params: PaystackInlineParams;
  onMessage: (message: PaystackWebViewMessage) => void;
};

function parseMessage(raw: string): PaystackWebViewMessage | null {
  try {
    const data = JSON.parse(raw) as PaystackWebViewMessage;
    if (!data || typeof data !== "object" || !("type" in data)) return null;
    if (data.type === "success") {
      const reference = typeof data.reference === "string" ? data.reference.trim() : "";
      if (!reference) return null;
      return { type: "success", reference };
    }
    if (data.type === "cancel") return { type: "cancel" };
    if (data.type === "error") {
      return {
        type: "error",
        message: typeof data.message === "string" ? data.message : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function emitOnce(
  handledRef: MutableRefObject<boolean>,
  onMessage: (message: PaystackWebViewMessage) => void,
  parsed: PaystackWebViewMessage,
) {
  if (parsed.type === "success" || parsed.type === "cancel") {
    if (handledRef.current) return;
    handledRef.current = true;
  }
  onMessage(parsed);
}

/** Browser: `react-native-webview` is unsupported — use an iframe + postMessage. */
function PaystackWebIframe({ params, onMessage }: Props) {
  const handledRef = useRef(false);
  const html = useMemo(() => buildPaystackInlineHtml(params), [params]);

  useEffect(() => {
    handledRef.current = false;
    const onWindowMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const parsed = parseMessage(event.data);
      if (!parsed) return;
      emitOnce(handledRef, onMessage, parsed);
    };
    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [onMessage, params.reference]);

  return (
    <View style={styles.wrap}>
      <iframe
        title="Paystack checkout"
        srcDoc={html}
        style={iframeStyle}
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation-by-user-activation"
      />
    </View>
  );
}

function PaystackNativeWebView({ params, onMessage }: Props) {
  const handledRef = useRef(false);
  const html = useMemo(() => buildPaystackInlineHtml(params), [params]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseMessage(event.nativeEvent.data);
      if (!parsed) return;
      emitOnce(handledRef, onMessage, parsed);
    },
    [onMessage],
  );

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://js.paystack.co" }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        style={styles.web}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        {...(Platform.OS === "ios"
          ? { allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }
          : {})}
      />
    </View>
  );
}

export function PaystackWebView(props: Props) {
  if (Platform.OS === "web") {
    return <PaystackWebIframe {...props} />;
  }
  return <PaystackNativeWebView {...props} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 420, overflow: "hidden", borderRadius: 16 },
  web: { flex: 1, backgroundColor: "transparent" },
});

/** DOM iframe styles — not valid RN StyleSheet keys (e.g. `border`). */
const iframeStyle = {
  width: "100%",
  height: "100%",
  minHeight: 420,
  border: "none",
  borderRadius: 16,
  backgroundColor: "transparent",
} as const;
