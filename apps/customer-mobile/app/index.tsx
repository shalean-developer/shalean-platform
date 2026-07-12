import { Redirect } from "expo-router";
import { LoadingState } from "@shalean/mobile-ui";
import { useAuth } from "@/providers/AuthProvider";

/** Auth gate — signed-out → welcome; signed-in → Home. */
export default function IndexGate() {
  const { status } = useAuth();

  if (__DEV__) {
    console.info("[startup] IndexGate status=", status);
  }

  if (status === "loading") {
    return <LoadingState label="Starting Shalean…" />;
  }

  if (status === "signedIn") {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
