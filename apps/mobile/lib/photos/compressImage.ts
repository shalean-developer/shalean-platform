import * as ImageManipulator from "expo-image-manipulator";
import { diagnosticLog } from "@/lib/diagnostics/logger";

export type CompressedImage = {
  uri: string;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
};

/** Compress / resize images before upload (max edge 1600px, JPEG ~0.7). */
export async function compressImageForUpload(params: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<CompressedImage> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      params.uri,
      [{ resize: { width: 1600 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    diagnosticLog.info("Image compressed", {
      width: result.width,
      height: result.height,
    });

    return {
      uri: result.uri,
      mimeType: "image/jpeg",
      fileName: params.fileName?.replace(/\.\w+$/, ".jpg") || "photo.jpg",
      width: result.width,
      height: result.height,
    };
  } catch (e) {
    diagnosticLog.warn("Image compression failed; using original", {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      uri: params.uri,
      mimeType: params.mimeType || "image/jpeg",
      fileName: params.fileName || "photo.jpg",
    };
  }
}
