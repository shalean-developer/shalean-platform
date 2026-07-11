import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isValidContactPhone } from "@shalean/validation";
import { AppButton } from "@/components/ui/AppButton";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/theme";

const schema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine(isValidContactPhone, "Enter a valid phone number"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onSuccess?: () => void;
};

export function SignInForm({ onSuccess }: Props) {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await signIn(values.phone, values.password);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    onSuccess?.();
  });

  return (
    <View className="w-full gap-4" accessibilityLabel="Cleaner sign in form">
      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Phone number"
            labelId="cleaner-phone-label"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="082 123 4567"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            editable={!isSubmitting}
            error={errors.phone?.message}
            accessibilityHint="Enter the phone number linked to your cleaner account"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Text nativeID="cleaner-password-label" className="mb-1.5 text-sm font-medium text-ink">
              Password
            </Text>
            <View className="relative">
              <TextInput
                className={`min-h-touch rounded-xl border bg-surface-card py-3.5 pl-4 pr-12 text-base text-ink ${
                  errors.password ? "border-danger" : "border-border"
                }`}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoCapitalize="none"
                placeholder="Password"
                placeholderTextColor={colors.ink.muted}
                selectionColor={colors.brand[500]}
                cursorColor={colors.brand[500]}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Password"
                accessibilityLabelledBy="cleaner-password-label"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={8}
                className="absolute bottom-0 right-0 top-0 min-w-touch items-center justify-center"
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={colors.ink.muted}
                />
              </Pressable>
            </View>
            {errors.password ? (
              <Text accessibilityLiveRegion="polite" className="mt-1 text-sm text-danger">
                {errors.password.message}
              </Text>
            ) : null}
          </View>
        )}
      />

      {formError ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" className="text-sm text-danger">
          {formError}
        </Text>
      ) : null}

      <AppButton
        label="Sign in"
        onPress={() => void onSubmit()}
        loading={isSubmitting}
        disabled={isSubmitting}
        className="mt-2"
      />
    </View>
  );
}
