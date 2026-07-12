import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Text, View } from "react-native";
import { AppButton, TextField } from "@shalean/mobile-ui";
import { normalizeEmail } from "@shalean/utils";
import { useAuth } from "@/providers/AuthProvider";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onSuccess?: () => void;
};

export function ForgotPasswordForm({ onSuccess }: Props) {
  const { requestPasswordReset } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await requestPasswordReset(normalizeEmail(values.email));
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSent(true);
    onSuccess?.();
  });

  if (sent) {
    return (
      <View className="w-full gap-3" accessibilityLiveRegion="polite">
        <Text className="text-title text-ink">Check your email</Text>
        <Text className="text-caption text-ink-muted">
          If an account exists for that address, we sent a reset link. Open it on this device or
          any browser to choose a new password.
        </Text>
      </View>
    );
  }

  return (
    <View className="w-full gap-4" accessibilityLabel="Forgot password form">
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="you@example.com"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            editable={!isSubmitting}
            error={errors.email?.message}
          />
        )}
      />

      {formError ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" className="text-caption text-danger">
          {formError}
        </Text>
      ) : null}

      <AppButton
        label="Send reset link"
        onPress={() => void onSubmit()}
        loading={isSubmitting}
        disabled={isSubmitting}
      />
    </View>
  );
}
