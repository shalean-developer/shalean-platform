import { ScrollView, Text, View } from "react-native";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { useAuth } from "@/providers/AuthProvider";

export default function CleanerContactScreen() {
  const { profile } = useAuth();
  const { data } = useCleanerProfile();
  const cleaner = data?.cleaner ?? profile?.cleaner;
  const phone = cleaner?.phone_number || cleaner?.phone || "Not provided";
  const email = cleaner?.email;
  const isInternalEmail = Boolean(email && (email.endsWith(".local") || email.endsWith("@cleaner.shalean.com")));

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="px-4 py-4">
        <SectionCard flush className="overflow-hidden p-0">
          <ListRow label="Phone" value={phone} icon="call-outline" showChevron={false} />
          {email && !isInternalEmail ? (
            <View className="mx-4 border-t border-border">
              <ListRow label="Email" value={email} icon="mail-outline" showChevron={false} />
            </View>
          ) : null}
        </SectionCard>
        {isInternalEmail ? (
          <Text className="mt-3 text-sm text-ink-muted">
            No verified contact email is on file.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
