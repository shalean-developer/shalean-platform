import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { normalizeEmail } from "@shalean/utils";
import { AuthScreenChrome } from "@/features/auth/AuthScreenChrome";
import { useAuth } from "@/providers/AuthProvider";
import { textStyle } from "@/theme";

const BRAND = "#2563eb";
const BRAND_DARK = "#1e40af";
const FIELD_BG = "#eff6ff";
const INK = "#14201b";
const MUTED = "#5b6b63";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await signIn(normalizeEmail(values.email), values.password);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.replace("/(tabs)/home");
  });

  return (
    <AuthScreenChrome
      onBack={() => router.back()}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Login"
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
            <Text style={{ ...textStyle("button"), color: "#FFFFFF" }}>Login</Text>
          )}
        </Pressable>
      }
    >
      <Text style={styles.sectionTitle}>Log-In with</Text>

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
                autoCorrect={false}
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
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldBlock}>
            <View style={[styles.field, errors.password ? styles.fieldError : null]}>
              <Feather name="lock" size={20} color={BRAND_DARK} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoCapitalize="none"
                placeholder="Password"
                placeholderTextColor="#8a9a91"
                selectionColor={BRAND}
                cursorColor={BRAND}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                editable={!isSubmitting}
                accessibilityLabel="Password"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={8}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={MUTED}
                />
              </Pressable>
            </View>
            {errors.password ? (
              <Text style={styles.error}>{errors.password.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Link href="/(auth)/forgot-password" asChild>
        <Pressable accessibilityRole="link" style={styles.forgotHit}>
          <Text style={styles.forgot}>Forgot Password?</Text>
        </Pressable>
      </Link>

      {formError ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {formError}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerMuted}>Don&apos;t have an account? </Text>
        <Link href="/(auth)/signup" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text style={styles.footerLink}>Sign up</Text>
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
    paddingRight: 6,
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
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotHit: {
    alignSelf: "center",
    height: 40,
    justifyContent: "center",
    marginBottom: 8,
  },
  forgot: {
    ...textStyle("secondary"),
    color: MUTED,
  },
  error: {
    ...textStyle("secondary"),
    marginTop: 6,
    marginBottom: 8,
    color: "#b42318",
  },
  footer: {
    marginTop: 20,
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
