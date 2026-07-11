import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/ui/StateViews";

/** Session restore splash — redirects once auth status is known. */
export default function SplashScreen() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Starting…" />;
  }

  if (status === "signedIn") {
    return <Redirect href="/(cleaner)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
