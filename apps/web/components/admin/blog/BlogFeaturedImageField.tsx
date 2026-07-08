"use client";

import { useId, useRef } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WpLabeledField } from "./WordPressPostEditorLayout";
import { useBlogMediaUpload } from "./useBlogMediaUpload";

type Props = {
  imageUrl: string;
  altText: string;
  onImageUrlChange: (url: string) => void;
  onAltTextChange: (alt: string) => void;
  slug?: string;
};

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function BlogFeaturedImageField({
  imageUrl,
  altText,
  onImageUrlChange,
  onAltTextChange,
  slug,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading, error, clearError } = useBlogMediaUpload();
  const previewSrc = imageUrl.trim();
  const folder = slug?.trim() ? `featured/${slug.trim().slice(0, 48)}` : "featured";

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    clearError();
    const result = await uploadFile(file, { folder });
    if (!result) return;
    onImageUrlChange(result.url);
    if (!altText.trim()) {
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      if (base) onAltTextChange(base);
    }
  };

  return (
    <div className="space-y-3">
      {previewSrc ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <Image
            src={previewSrc}
            alt={altText.trim() || "Featured image preview"}
            fill
            className="object-cover"
            sizes="280px"
            unoptimized={isRemoteSrc(previewSrc)}
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50/80 px-3 text-center dark:border-zinc-600 dark:bg-zinc-900/50">
          <ImagePlus className="h-8 w-8 text-zinc-400" aria-hidden />
          <p className="text-xs text-zinc-500">No featured image yet</p>
        </div>
      )}

      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void onPickFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Upload from computer"}
        </Button>
        {previewSrc ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onImageUrlChange("")}>
            Remove
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <WpLabeledField label="Image URL" htmlFor="wp-feat">
        <Input
          id="wp-feat"
          className="font-mono text-xs"
          value={imageUrl}
          onChange={(e) => onImageUrlChange(e.target.value)}
          placeholder="https://… or /images/…"
        />
      </WpLabeledField>
      <WpLabeledField label="Alt text" htmlFor="wp-feata">
        <Input id="wp-feata" value={altText} onChange={(e) => onAltTextChange(e.target.value)} />
      </WpLabeledField>
    </div>
  );
}
