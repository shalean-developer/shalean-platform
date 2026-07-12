import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { LoadingState } from "@shalean/mobile-ui";
import { useAuth } from "@/providers/AuthProvider";
import { homeColors } from "@/features/home/homeTheme";

function TabIcon({
  name,
  focused,
}: {
  name: keyof typeof Feather.glyphMap;
  focused: boolean;
}) {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? homeColors.primary : "rgba(255,255,255,0.72)",
      }}
    >
      <Feather name={name} size={20} color={focused ? "#FFFFFF" : "#64748b"} />
    </View>
  );
}

export default function TabsLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status !== "signedIn") {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: homeColors.primary,
        tabBarInactiveTintColor: "#64748b",
        sceneStyle: { backgroundColor: homeColors.bg },
        tabBarStyle: {
          position: "absolute",
          left: 18,
          right: 18,
          bottom: Platform.OS === "ios" ? 36 : 28,
          height: 72,
          borderRadius: 36,
          backgroundColor: homeColors.tabBar,
          borderTopWidth: 0,
          paddingHorizontal: 10,
          paddingTop: 0,
          paddingBottom: 0,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        },
        tabBarItemStyle: {
          height: 72,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ focused }) => <TabIcon name="calendar" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: "Rewards",
          tabBarIcon: ({ focused }) => <TabIcon name="gift" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
