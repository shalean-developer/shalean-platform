import * as Updates from "expo-updates";
import { Platform } from "react-native";

export type UpdateCheckResult =
  | { status: "unavailable"; message: string }
  | { status: "up_to_date"; message: string }
  | { status: "available"; message: string }
  | { status: "error"; message: string };

/**
 * Check + optionally apply an EAS Update. Soft-fails in Expo Go / web / missing project.
 */
export async function checkForCustomerAppUpdate(opts?: {
  apply?: boolean;
}): Promise<UpdateCheckResult> {
  if (Platform.OS === "web") {
    return { status: "unavailable", message: "Updates are not available on web." };
  }
  if (__DEV__) {
    return {
      status: "unavailable",
      message: "OTA updates are disabled in development builds.",
    };
  }
  if (!Updates.isEnabled) {
    return {
      status: "unavailable",
      message: "Updates are not enabled for this install (need an EAS build).",
    };
  }

  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) {
      return { status: "up_to_date", message: "You’re on the latest version." };
    }
    if (opts?.apply === false) {
      return {
        status: "available",
        message: "An update is available. Restart to apply.",
      };
    }
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return { status: "available", message: "Update applied." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not check for updates.";
    return { status: "error", message };
  }
}
