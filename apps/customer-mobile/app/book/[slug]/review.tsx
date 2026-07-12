import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@shalean/mobile-ui";
import { BookingStepHeader } from "@/features/booking/BookingStepHeader";
import { BookingStickyFooter } from "@/features/booking/BookingStickyFooter";
import { useBookingWizard } from "@/features/booking/BookingWizardProvider";
import { SoftCard } from "@/features/shared/SoftUi";
import { homeColors } from "@/features/home/homeTheme";
import { formatCustomerBookingSlotLabel } from "@/lib/booking/timeSlots";
import { AppText } from "@/theme";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        marginBottom: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <AppText variant="secondary" style={{ color: homeColors.muted }}>
        {label}
      </AppText>
      <AppText
        variant="secondary"
        style={{
          flex: 1,
          textAlign: "right",
          color: homeColors.ink,
          fontWeight: "600",
        }}
      >
        {value}
      </AppText>
    </View>
  );
}

function EditLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={{ marginBottom: 10, alignSelf: "flex-end" }}
    >
      <AppText variant="secondary" style={{ color: homeColors.primary, fontWeight: "700" }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function BookingReviewScreen() {
  const router = useRouter();
  const { form, liveConfig } = useBookingWizard();
  const base = `/book/${form.serviceSlug}`;

  const extrasLabels =
    form.selectedExtras
      .map((id) => liveConfig?.extras.find((e) => e.id === id)?.label ?? id)
      .join(", ") || "None";

  const cleanerLabel =
    form.cleanerMode === "team"
      ? form.assignedTeamName || "Team selected"
      : form.selectedCleanerDetails.length > 0
        ? form.selectedCleanerDetails.map((c) => c.name).join(", ")
        : "Best available";

  return (
    <Screen
      scroll={false}
      edges={["top", "bottom"]}
      contentClassName="flex-1"
      style={{ backgroundColor: homeColors.bg }}
    >
      <View className="flex-1 px-4 pt-2">
        <BookingStepHeader step={3} title="Review" />
        <ScrollView className="flex-1" contentContainerClassName="pb-4">
          <SoftCard title="Service">
            <EditLink href={`${base}/details`} label="Edit details" />
            <SummaryRow label="Service" value={liveConfig?.label ?? form.serviceSlug} />
            <SummaryRow label="Address" value={form.address} />
            <SummaryRow
              label="Suburb"
              value={`${form.suburb}${form.city ? `, ${form.city}` : ""}`}
            />
            <SummaryRow label="Phone" value={form.contactPhone} />
            <SummaryRow label="Extras" value={extrasLabels} />
            {form.equipmentRequired === "yes" ? (
              <SummaryRow label="Equipment" value="Delivery requested" />
            ) : null}
          </SoftCard>

          <SoftCard title="Schedule">
            <EditLink href={`${base}/schedule`} label="Edit schedule" />
            <SummaryRow
              label="Type"
              value={
                form.bookingType === "recurring"
                  ? `Recurring (${form.recurringFrequency || "—"})`
                  : "Once-off"
              }
            />
            <SummaryRow label="Date" value={form.date} />
            <SummaryRow
              label="Time"
              value={form.time ? formatCustomerBookingSlotLabel(form.time) : "—"}
            />
            <SummaryRow label="Cleaner" value={cleanerLabel} />
          </SoftCard>
        </ScrollView>
      </View>
      <BookingStickyFooter
        label="Continue to checkout"
        onPress={() => router.push(`${base}/checkout` as never)}
        amountZar={form.pricingSummary?.estimated_total ?? form.pricingSummary?.total}
      />
    </Screen>
  );
}
