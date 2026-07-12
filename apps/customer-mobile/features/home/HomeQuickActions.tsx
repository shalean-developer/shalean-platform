import { useRouter } from "expo-router";
import { IconActionGrid } from "@/components/ui/IconActionGrid";

export function HomeQuickActions() {
  const router = useRouter();

  return (
    <IconActionGrid
      className="mb-5"
      items={[
        {
          key: "bookings",
          label: "Bookings",
          icon: "calendar",
          onPress: () => router.push("/(tabs)/bookings"),
        },
        {
          key: "book",
          label: "Book",
          icon: "plus-circle",
          onPress: () => router.push("/book/regular-cleaning/details" as never),
        },
        {
          key: "rewards",
          label: "Rewards",
          icon: "gift",
          onPress: () => router.push("/(tabs)/rewards"),
        },
        {
          key: "profile",
          label: "Account",
          icon: "user",
          onPress: () => router.push("/(tabs)/profile"),
        },
      ]}
    />
  );
}
