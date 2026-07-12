import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { AppButton, ErrorState, Screen } from "@shalean/mobile-ui";
import { API_BASE_URL } from "@/constants/config";
import { getCustomerInvoicesApi } from "@/services/customerApi";
import { getAccessToken } from "@/lib/storage/tokenStorage";
import { colors } from "@/theme";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function InvoicePdfScreen() {
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const pdfKind = kind === "booking" ? "booking" : "monthly";
  const pdfId = (id ?? "").trim();

  const [base64, setBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pdfId) {
        setError("Missing invoice.");
        setLoading(false);
        return;
      }
      try {
        const token = await getAccessToken();
        if (!token) {
          setError("Sign in required.");
          setLoading(false);
          return;
        }
        const path =
          pdfKind === "monthly"
            ? getCustomerInvoicesApi().monthlyPdfUrl(pdfId)
            : getCustomerInvoicesApi().bookingPdfUrl(pdfId);
        const url = `${API_BASE_URL.replace(/\/$/, "")}${path}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let message = `Could not open PDF (${res.status}).`;
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            // ignore
          }
          if (!cancelled) {
            setError(message);
            setLoading(false);
          }
          return;
        }
        const buf = await res.arrayBuffer();
        const b64 = bytesToBase64(new Uint8Array(buf));
        if (!cancelled) {
          setBase64(b64);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not download invoice PDF.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfId, pdfKind]);

  if (loading) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={colors.brand[500]} />
          <Text className="text-body text-ink-muted">Loading PDF…</Text>
        </View>
      </Screen>
    );
  }

  if (error || !base64) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Invoice unavailable"
          message={error ?? "PDF not found."}
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:#0f172a">
<embed src="data:application/pdf;base64,${base64}" type="application/pdf" width="100%" height="100%" />
</body></html>`;

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentClassName="flex-1">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-title text-ink">Invoice PDF</Text>
        <AppButton label="Close" variant="ghost" onPress={() => router.back()} />
      </View>
      <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1 }} />
    </Screen>
  );
}
