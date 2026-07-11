import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useJobPhotoUpload } from "@/hooks/useJobActions";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

type Props = { job: CleanerJobWire };

type BusyState = {
  key: string;
  percent: number;
  phase: "compressing" | "uploading" | "queued";
};

export function JobPhotosPanel({ job }: Props) {
  const qa = job.service_qa;
  const upload = useJobPhotoUpload(job.id);
  const { isOnline } = useConnectivity();
  const [busy, setBusy] = useState<BusyState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!qa || !qa.sections?.length) {
    return (
      <View className="rounded-xl bg-surface-muted px-4 py-3">
        <Text className="text-sm text-ink-muted">
          Before/after photos apply to deep and move-out jobs only. This job has no photo checklist.
        </Text>
      </View>
    );
  }

  const cancelUpload = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
  };

  const startUpload = async (
    sectionKey: string,
    photoType: "before" | "after",
    asset: ImagePicker.ImagePickerAsset,
  ) => {
    const key = `${sectionKey}:${photoType}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ key, percent: 0, phase: "compressing" });

    upload.mutate(
      {
        sectionKey,
        photoType,
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        signal: controller.signal,
        onProgress: (p) => {
          setBusy({ key, percent: p.percent, phase: "uploading" });
        },
      },
      {
        onSuccess: (result) => {
          if (result.queued) {
            setBusy({ key, percent: 100, phase: "queued" });
            Alert.alert(
              "Photo queued",
              "You're offline. The photo will upload automatically when you're back online.",
            );
          } else {
            Alert.alert("Uploaded", "Photo uploaded successfully.");
          }
        },
        onError: (err) => {
          const message = friendlyErrorMessage(err);
          if (message === "Upload cancelled.") return;
          Alert.alert("Upload failed", message, [
            { text: "OK", style: "cancel" },
            {
              text: "Retry",
              onPress: () => void startUpload(sectionKey, photoType, asset),
            },
          ]);
        },
        onSettled: () => {
          abortRef.current = null;
          setBusy(null);
        },
      },
    );
  };

  const pickSource = (sectionKey: string, photoType: "before" | "after") => {
    Alert.alert("Add photo", "Choose a source", [
      {
        text: "Camera",
        onPress: () => void capture(sectionKey, photoType, "camera"),
      },
      {
        text: "Gallery",
        onPress: () => void capture(sectionKey, photoType, "gallery"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const capture = async (
    sectionKey: string,
    photoType: "before" | "after",
    source: "camera" | "gallery",
  ) => {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow camera access to take job photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      await startUpload(sectionKey, photoType, result.assets[0]);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload job photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await startUpload(sectionKey, photoType, result.assets[0]);
  };

  return (
    <View className="gap-4">
      {!isOnline ? (
        <Text className="text-xs text-ink-muted">Offline — new photos will queue until you reconnect.</Text>
      ) : null}
      {qa.sections.map((sectionKey) => {
        const label = qa.section_labels?.[sectionKey] ?? sectionKey;
        const photos = (qa.photos ?? []).filter((p) => p.section_key === sectionKey);
        const before = photos.filter((p) => p.photo_type === "before");
        const after = photos.filter((p) => p.photo_type === "after");

        return (
          <View key={sectionKey} className="rounded-xl bg-surface-muted p-3">
            <Text className="mb-3 text-base font-semibold text-ink">{label}</Text>
            <PhotoRow
              title="Before"
              photos={before}
              busy={busy?.key === `${sectionKey}:before` ? busy : null}
              onAdd={() => pickSource(sectionKey, "before")}
              onCancel={cancelUpload}
            />
            <View className="h-3" />
            <PhotoRow
              title="After"
              photos={after}
              busy={busy?.key === `${sectionKey}:after` ? busy : null}
              onAdd={() => pickSource(sectionKey, "after")}
              onCancel={cancelUpload}
            />
          </View>
        );
      })}
    </View>
  );
}

function PhotoRow({
  title,
  photos,
  busy,
  onAdd,
  onCancel,
}: {
  title: string;
  photos: { id: string; signed_url: string | null }[];
  busy: BusyState | null;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink-muted">{title}</Text>
        {busy ? (
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel upload"
            className="min-h-10 justify-center rounded-md px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-danger">Cancel</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add ${title.toLowerCase()} photo`}
            className="min-h-10 flex-row items-center gap-1.5 justify-center rounded-lg bg-brand-50 px-3 py-1.5 active:opacity-80"
          >
            <Ionicons name="camera-outline" size={16} color={colors.brand[600]} />
            <Text className="text-sm font-semibold text-brand-600">Add</Text>
          </Pressable>
        )}
      </View>

      {busy ? (
        <View className="mb-2 rounded-md bg-surface-card px-3 py-2" accessibilityLiveRegion="polite">
          <Text className="mb-1 text-xs text-ink-muted">
            {busy.phase === "compressing"
              ? "Compressing…"
              : busy.phase === "queued"
                ? "Queued for upload"
                : `Uploading ${busy.percent}%`}
          </Text>
          <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <View
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${Math.max(busy.phase === "compressing" ? 10 : busy.percent, 4)}%` }}
            />
          </View>
          {busy.phase === "uploading" ? (
            <ActivityIndicator style={{ marginTop: 8 }} size="small" color={colors.brand[500]} />
          ) : null}
        </View>
      ) : null}

      {photos.length === 0 ? (
        <Text className="text-xs text-ink-muted">No {title.toLowerCase()} photos yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((p) =>
            p.signed_url ? (
              <Image
                key={p.id}
                source={{ uri: p.signed_url }}
                className="h-20 w-20 rounded-lg bg-surface-muted"
                accessibilityLabel={`${title} photo`}
              />
            ) : (
              <View
                key={p.id}
                className="h-20 w-20 items-center justify-center rounded-lg bg-surface-card"
                accessibilityLabel={`${title} photo uploaded`}
              >
                <Ionicons name="checkmark-circle" size={22} color={colors.brand[500]} />
                <Text className="mt-1 text-[10px] font-medium text-ink-muted">Saved</Text>
              </View>
            ),
          )}
        </View>
      )}
    </View>
  );
}
