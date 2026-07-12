import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { TextField } from "@shalean/mobile-ui";
import { SuburbLocationSheet } from "@/features/booking/components/SuburbLocationSheet";
import { AppText, colors } from "@/theme";

type InstructionKey = "access" | "parking" | "gate";

type Props = {
  address: string;
  suburb: string;
  city: string;
  postalCode: string;
  accessInstructions: string;
  parkingInstructions: string;
  gateCode: string;
  contactPhone: string;
  specialInstructions?: string;
  locationLoading?: boolean;
  locationError?: string | null;
  errors?: Partial<Record<string, string>>;
  onChange: (patch: Record<string, string>) => void;
  onSpecialInstructionsChange?: (value: string) => void;
};

const INSTRUCTION_CHIPS: {
  key: InstructionKey;
  label: string;
  field: "accessInstructions" | "parkingInstructions" | "gateCode";
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    key: "access",
    label: "Access",
    field: "accessInstructions",
    placeholder: "Gate code, intercom, etc.",
    multiline: true,
  },
  {
    key: "parking",
    label: "Parking",
    field: "parkingInstructions",
    placeholder: "Street parking, driveway…",
  },
  {
    key: "gate",
    label: "Gate",
    field: "gateCode",
    placeholder: "Optional access code",
  },
];

export function AddressFields({
  address,
  suburb,
  city,
  postalCode,
  accessInstructions,
  parkingInstructions,
  gateCode,
  contactPhone,
  specialInstructions = "",
  locationLoading,
  locationError,
  errors,
  onChange,
  onSpecialInstructionsChange,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeInstruction, setActiveInstruction] = useState<InstructionKey>("access");

  const values: Record<InstructionKey, string> = {
    access: accessInstructions,
    parking: parkingInstructions,
    gate: gateCode,
  };

  const active = INSTRUCTION_CHIPS.find((c) => c.key === activeInstruction) ?? INSTRUCTION_CHIPS[0];

  const suburbHint = useMemo(() => {
    if (locationLoading) return "Matching service area…";
    if (locationError) return locationError;
    return undefined;
  }, [locationLoading, locationError]);

  return (
    <View className="gap-3">
      <TextField
        label="Street address *"
        value={address}
        onChangeText={(t) => onChange({ address: t })}
        placeholder="12 Ocean View Drive"
        autoComplete="street-address"
        error={errors?.address}
      />

      <View>
        <AppText variant="secondary" className="mb-1.5 font-medium text-ink">
          Suburb *
        </AppText>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={suburb ? `Suburb ${suburb}` : "Search suburb"}
          className={`min-h-touch flex-row items-center rounded-full border-2 bg-surface-card px-4 py-3 ${
            errors?.suburb ? "border-danger" : "border-brand-500"
          }`}
        >
          <Feather name="map-pin" size={18} color={colors.brand[500]} />
          <AppText
            variant="body"
            className={`ml-2 flex-1 ${suburb ? "text-ink" : "text-ink-muted"}`}
            numberOfLines={1}
          >
            {suburb || "Search suburb e.g. Claremont"}
          </AppText>
          <Feather name="chevron-down" size={18} color={colors.ink.subtle} />
        </Pressable>
        {errors?.suburb ? (
          <AppText variant="secondary" className="mt-1 text-danger">
            {errors.suburb}
          </AppText>
        ) : suburbHint ? (
          <AppText variant="secondary" className="mt-1 text-ink-muted">
            {suburbHint}
          </AppText>
        ) : null}
      </View>

      <SuburbLocationSheet
        visible={sheetOpen}
        value={suburb}
        onClose={() => setSheetOpen(false)}
        onSelect={(s) => onChange({ suburb: s })}
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextField
            label="City"
            value={city}
            onChangeText={(t) => onChange({ city: t })}
            placeholder="Cape Town"
          />
        </View>
        <View className="w-28">
          <TextField
            label="Postal"
            value={postalCode}
            onChangeText={(t) => onChange({ postalCode: t })}
            keyboardType="number-pad"
            placeholder="7708"
          />
        </View>
      </View>

      <TextField
        label="Contact phone *"
        value={contactPhone}
        onChangeText={(t) => onChange({ contactPhone: t })}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="082 123 4567"
        error={errors?.contactPhone}
      />

      <View>
        <AppText variant="secondary" className="mb-1.5 font-semibold text-ink">
          Visit notes
        </AppText>
        <View className="mb-3 flex-row gap-2">
          {INSTRUCTION_CHIPS.map((chip) => {
            const on = chip.key === activeInstruction;
            const filled = Boolean(values[chip.key]?.trim());
            return (
              <Pressable
                key={chip.key}
                onPress={() => setActiveInstruction(chip.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`min-w-0 flex-1 items-center rounded-xl border px-2 py-2.5 ${
                  on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <AppText
                  variant="label"
                  className={`text-center font-semibold ${
                    on ? "text-brand-600" : "text-ink-muted"
                  }`}
                  numberOfLines={1}
                >
                  {chip.label}
                </AppText>
                <AppText
                  variant="label"
                  className={`mt-0.5 text-center font-medium ${
                    on ? "text-brand-700" : filled ? "text-ink" : "text-ink-subtle"
                  }`}
                  numberOfLines={1}
                >
                  {filled ? "Added" : "—"}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <TextField
          key={active.field}
          label={
            active.key === "access"
              ? "Access instructions"
              : active.key === "parking"
                ? "Parking"
                : "Gate / access code"
          }
          value={values[active.key]}
          onChangeText={(t) => onChange({ [active.field]: t })}
          placeholder={active.placeholder}
          multiline={active.multiline}
        />
      </View>

      {onSpecialInstructionsChange ? (
        <TextField
          label="Special instructions (optional)"
          value={specialInstructions}
          onChangeText={onSpecialInstructionsChange}
          placeholder="e.g. focus on kitchen, avoid the study…"
          multiline
        />
      ) : null}
    </View>
  );
}
