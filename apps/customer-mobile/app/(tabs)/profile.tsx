import { Redirect, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ErrorState, LoadingState, Screen } from "@shalean/mobile-ui";
import { homeColors } from "@/features/home/homeTheme";
import {
  MenuRowCard,
  ScreenTitle,
  SectionHeading,
  SoftActionChip,
  softCardStyle,
} from "@/features/shared/SoftUi";
import { useCustomerProfile } from "@/hooks/useCustomerAccount";
import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";
import { greetingName } from "@/lib/bookings/bookingDisplay";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useAuth } from "@/providers/AuthProvider";
import { AppText } from "@/theme";

export default function ProfileTab() {
  const { status, profile: authProfile, signOut } = useAuth();
  const router = useRouter();
  const profileQuery = useCustomerProfile();
  const notificationsQuery = useCustomerNotifications();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  if (status === "loading") {
    return (
      <Screen scroll={false} edges={["top"]} style={{ backgroundColor: homeColors.bg }}>
        <LoadingState />
      </Screen>
    );
  }

  if (status !== "signedIn") {
    return <Redirect href="/(auth)/welcome" />;
  }

  const p = profileQuery.data;
  const displayName = greetingName(
    p?.email ?? authProfile?.email,
    p?.fullName ?? authProfile?.fullName,
  );
  const fullName = (p?.fullName ?? authProfile?.fullName)?.trim() || displayName;
  const email = p?.email ?? authProfile?.email ?? "—";
  const phone = p?.phone ?? "—";
  const initial = displayName.trim().charAt(0).toUpperCase() || "S";

  return (
    <Screen
      scroll
      edges={["top"]}
      style={{ backgroundColor: homeColors.bg }}
      contentClassName="pb-28 pt-1"
    >
      <ScreenTitle title="Profile" subtitle={`Hi ${displayName}`} />

      {profileQuery.isLoading && !p ? <LoadingState label="Loading…" /> : null}
      {profileQuery.isError && !p ? (
        <ErrorState
          title="Couldn’t load profile"
          message={friendlyErrorMessage(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
        />
      ) : null}

      {/* Identity card */}
      <View style={[softCardStyle, { marginBottom: 16 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: homeColors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText variant="hero" style={{ color: "#FFFFFF", fontWeight: "800" }}>
              {initial}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              variant="card"
              style={{ color: homeColors.ink, fontWeight: "700" }}
              numberOfLines={1}
            >
              {fullName}
            </AppText>
            <AppText
              variant="secondary"
              style={{ color: homeColors.muted, marginTop: 3 }}
              numberOfLines={1}
            >
              {email}
            </AppText>
            <AppText
              variant="secondary"
              style={{ color: homeColors.muted, marginTop: 2 }}
              numberOfLines={1}
            >
              {phone}
            </AppText>
          </View>
        </View>

        <View
          style={{
            height: 1,
            backgroundColor: "#EEF1F4",
            marginVertical: 14,
          }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <SoftActionChip
            label="Edit profile"
            icon="edit-2"
            onPress={() => router.push("/profile/edit" as never)}
          />
          <SoftActionChip
            label="Inbox"
            icon="bell"
            primary
            badge={unreadCount}
            onPress={() => router.push("/profile/notifications" as never)}
          />
        </View>
      </View>

      <SectionHeading title="Account tools" subtitle="Manage your account" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        <MenuRowCard
          icon="home"
          label="Properties"
          subtitle="Saved addresses"
          onPress={() => router.push("/profile/addresses" as never)}
        />
        <MenuRowCard
          icon="file-text"
          label="Invoices"
          subtitle="Billing & receipts"
          onPress={() => router.push("/profile/invoices" as never)}
        />
        <MenuRowCard
          icon="repeat"
          label="Recurring"
          subtitle="Cleaning plans"
          onPress={() => router.push("/bookings/recurring" as never)}
        />
        <MenuRowCard
          icon="settings"
          label="Settings"
          subtitle="Preferences & security"
          onPress={() => router.push("/profile/settings" as never)}
        />
      </View>

      <View style={[softCardStyle, { marginBottom: 12 }]}>
        <Pressable
          onPress={() => {
            void (async () => {
              await signOut();
              router.replace("/(auth)/welcome");
            })();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={{
            minHeight: 46,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#fdecec",
            borderRadius: 14,
            paddingHorizontal: 12,
          }}
        >
          <Feather name="log-out" size={16} color={homeColors.danger} />
          <AppText variant="secondary" style={{ color: homeColors.danger, fontWeight: "700" }}>
            Sign out
          </AppText>
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push("/(auth)/reset-password")}
        accessibilityRole="link"
        style={{
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <AppText variant="secondary" style={{ color: homeColors.primary, fontWeight: "600" }}>
          Password help
        </AppText>
      </Pressable>
    </Screen>
  );
}
