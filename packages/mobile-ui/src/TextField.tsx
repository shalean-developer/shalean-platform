import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "./theme";

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  labelId?: string;
};

/** Shared labelled text field — 48pt min height, accessible. */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, labelId, className = "", editable = true, ...rest },
  ref,
) {
  const id = labelId ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <View className="w-full">
      <Text nativeID={id} className="mb-1.5 text-caption font-medium text-ink">
        {label}
      </Text>
      <TextInput
        ref={ref}
        className={`min-h-touch rounded-xl border bg-surface-card px-4 py-3.5 text-body text-ink ${
          error ? "border-danger" : "border-border"
        } ${!editable ? "opacity-60" : ""} ${className}`}
        placeholderTextColor={colors.ink.muted}
        selectionColor={colors.brand[500]}
        cursorColor={colors.brand[500]}
        editable={editable}
        accessibilityLabel={label}
        accessibilityLabelledBy={id}
        accessibilityState={{ disabled: !editable }}
        {...rest}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="mt-1 text-caption text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1 text-caption text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
