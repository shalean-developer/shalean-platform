import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { normalizeEmail } from "@shalean/utils";
import { isValidContactPhone } from "@shalean/validation";
import { AuthLegalFooter } from "@/components/LegalLinks";
import { AuthScreenChrome } from "@/features/auth/AuthScreenChrome";
import { useAuth } from "@/providers/AuthProvider";
import { textStyle } from "@/theme";

const BRAND = "#2563eb";
const BRAND_DARK = "#1e40af";
const FIELD_BG = "#eff6ff";
const INK = "#14201b";
const MUTED = "#5b6b63";

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || isValidContactPhone(v), "Enter a valid phone number"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [confirmNotice, setConfirmNotice] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await signUp({
      email: normalizeEmail(values.email),
      password: values.password,
      fullName: values.fullName,
      phone: values.phone?.trim() || undefined,
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmNotice(true);
      return;
    }
    router.replace("/(tabs)/home");
  });

  const signUpButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign Up"
      disabled={isSubmitting}
      onPress={() => void onSubmit()}
      style={{
        width: "100%",
        height: 54,
        borderRadius: 999,
        backgroundColor: "#2563eb",
        alignItems: "center",
        justifyContent: "center",
        opacity: isSubmitting ? 0.75 : 1,
      }}
    >
      {isSubmitting ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ ...textStyle("button"), color: "#FFFFFF" }}>Sign Up</Text>
      )}
    </Pressable>
  );

  if (confirmNotice) {
    return (
      <AuthScreenChrome
        onBack={() => router.back()}
        footer={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(auth)/login")}
            style={{
              width: "100%",
              height: 54,
              borderRadius: 999,
              backgroundColor: "#2563eb",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...textStyle("button"), color: "#FFFFFF" }}>Go to login</Text>
          </Pressable>
        }
      >
        <Text style={styles.confirmTitle}>Confirm your email</Text>
        <Text style={styles.confirmBody}>
          We sent a confirmation link. Open it, then log in to continue.
        </Text>
      </AuthScreenChrome>
    );
  }

  return (
    <AuthScreenChrome onBack={() => router.back()} footer={signUpButton}>
      {/* No social login — email/password only */}
      <Text style={styles.sectionTitle}>Create account</Text>

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.fullName ? styles.fieldError : null]}>
              <Feather name="user" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                textContentType="name"
                autoComplete="name"
                placeholder="Full name"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Full name"
              />
            </View>
            {errors.fullName ? (
              <Text style={styles.error}>{errors.fullName.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.email ? styles.fieldError : null]}>
              <Feather name="mail" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                placeholder="Email Address"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Email Address"
              />
            </View>
            {errors.email ? <Text style={styles.error}>{errors.email.message}</Text> : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.phone ? styles.fieldError : null]}>
              <Feather name="phone" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="Phone (optional)"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value ?? ""}
                editable={!isSubmitting}
                accessibilityLabel="Phone optional"
              />
            </View>
            {errors.phone ? (
              <Text style={styles.error}>{errors.phone.message}</Text>
            ) : (
              <Text style={styles.hint}>Used for booking updates</Text>
            )}
          </View>
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.password ? styles.fieldError : null]}>
              <Feather name="lock" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                placeholder="Password (min 8 characters)"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Password"
              />
            </View>
            {errors.password ? (
              <Text style={styles.error}>{errors.password.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.confirmPassword ? styles.fieldError : null]}>
              <Feather name="lock" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                placeholder="Confirm password"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Confirm password"
              />
            </View>
            {errors.confirmPassword ? (
              <Text style={styles.error}>{errors.confirmPassword.message}</Text>
            ) : null}
          </View>
        )}
      />

      {formError ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {formError}
        </Text>
      ) : null}

      <AuthLegalFooter />

      <View style={styles.footer}>
        <Text style={styles.footerMuted}>Already have an account? </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text style={styles.footerLink}>login</Text>
          </Pressable>
        </Link>
      </View>
    </AuthScreenChrome>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...textStyle("title"),
    color: INK,
    marginBottom: 14,
  },
  fieldBlock: {
    width: "100%",
    marginBottom: 12,
  },
  field: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FIELD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    paddingLeft: 14,
    paddingRight: 14,
  },
  fieldError: {
    borderColor: "#b42318",
  },
  input: {
    ...textStyle("body"),
    flex: 1,
    height: 52,
    marginLeft: 10,
    color: INK,
    paddingVertical: 0,
  },
  hint: {
    ...textStyle("label"),
    marginTop: 6,
    marginLeft: 4,
    color: MUTED,
  },
  error: {
    ...textStyle("secondary"),
    marginTop: 6,
    color: "#b42318",
  },
  confirmTitle: {
    ...textStyle("title"),
    color: INK,
    marginBottom: 12,
  },
  confirmBody: {
    ...textStyle("body"),
    color: MUTED,
    marginBottom: 24,
  },
  footer: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  footerMuted: {
    ...textStyle("secondary"),
    color: MUTED,
  },
  footerLink: {
    ...textStyle("secondary"),
    fontWeight: "700",
    color: BRAND,
  },
});
