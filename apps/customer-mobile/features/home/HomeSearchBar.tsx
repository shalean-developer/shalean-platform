import { Pressable, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { textStyle } from "@/theme";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onFilterPress?: () => void;
};

export function HomeSearchBar({ value, onChangeText, onFilterPress }: Props) {
  return (
    <View className="mb-6 flex-row items-center gap-3">
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: homeColors.card,
          borderRadius: 999,
          paddingHorizontal: 16,
          height: 52,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Feather name="search" size={18} color={homeColors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search For service..."
          placeholderTextColor={homeColors.muted}
          style={{
            flex: 1,
            marginLeft: 10,
            ...textStyle("body"),
            color: homeColors.ink,
            paddingVertical: 0,
          }}
          returnKeyType="search"
          accessibilityLabel="Search for service"
        />
      </View>

      <Pressable
        onPress={onFilterPress}
        accessibilityRole="button"
        accessibilityLabel="Filter services"
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: homeColors.card,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Feather name="sliders" size={20} color={homeColors.ink} />
      </Pressable>
    </View>
  );
}
