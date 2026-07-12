import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { filterSuburbOptions } from "@/lib/booking/suburbOptions";
import { AppText, colors } from "@/theme";

type Props = {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (suburb: string) => void;
};

/** Bottom sheet with pill location search for suburb pick. */
export function SuburbLocationSheet({ visible, value, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    if (visible) {
      setQuery(value);
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [visible, value]);

  const results = useMemo(() => filterSuburbOptions(query, 24), [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          className="max-h-[78%] rounded-t-3xl border-t border-border bg-surface-card px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-border-strong" />
          </View>

          <AppText variant="section" className="mb-3 text-ink">
            Choose suburb
          </AppText>

          <View className="mb-3 flex-row items-center rounded-full border-2 border-brand-500 bg-surface-card px-4 py-2.5">
            <Feather name="map-pin" size={18} color={colors.brand[500]} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search suburb e.g. Claremont"
              placeholderTextColor={colors.ink.muted}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              className="ml-2 min-h-[40px] flex-1 text-body text-ink"
              accessibilityLabel="Location search"
              selectionColor={colors.brand[500]}
              cursorColor={colors.brand[500]}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x" size={18} color={colors.ink.subtle} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <AppText variant="secondary" className="px-1 py-6 text-center text-ink-muted">
                No matching suburbs. Try another spelling.
              </AppText>
            }
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className={`mb-1 flex-row items-center justify-between rounded-xl px-3 py-3 active:bg-surface-muted ${
                    selected ? "bg-brand-50" : ""
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <AppText
                    variant="body"
                    className={selected ? "font-semibold text-brand-700" : "text-ink"}
                  >
                    {item}
                  </AppText>
                  {selected ? (
                    <Feather name="check" size={18} color={colors.brand[600]} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
