"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WpLabeledField } from "./WordPressPostEditorLayout";
import { resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
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

function FeaturedImagePreview({ src, alt, automatic }: { src: string; alt: string; automatic: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "placeholder" | "error">(src === "/images/default-cleaning.jpg" ? "placeholder" : "loading");
  return <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 text-center dark:border-zinc-700 dark:bg-zinc-900">
    {state === "loading" || state === "loaded" ? <Image src={src} alt={alt || "Featured image preview"} fill className={state === "loaded" ? "object-cover" : "object-cover opacity-0"} sizes="300px" unoptimized={isRemoteSrc(src)} onLoad={event => setState(event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1 ? "placeholder" : "loaded")} onError={() => setState("error")} /> : null}
    {state !== "loaded" ? <div role="status" className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300"><ImagePlus className="mx-auto h-7 w-7" aria-hidden /><p>{state === "loading" ? "Loading image preview…" : state === "error" ? "Image preview could not load. Check the URL or upload an image." : "Placeholder image. Choose a featured image for this article."}</p></div> : null}
    {state === "loaded" && automatic ? <span className="absolute bottom-2 left-2 rounded bg-white/95 px-2 py-1 text-xs text-zinc-700">Automatic image</span> : null}
  </div>;
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
  const resolvedSrc = resolveBlogFeaturedSrc(slug ?? "", previewSrc || null);
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
      {isAllowedAuthoringBlogImageSrc(resolvedSrc) ? <FeaturedImagePreview key={resolvedSrc} src={resolvedSrc} alt={altText.trim()} automatic={!previewSrc} /> : <p role="status" className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">Choose an image to see a preview.</p>}

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
            Use automatic image
          </Button>
        ) : null}
      </div>

      {previewSrc && !isAllowedAuthoringBlogImageSrc(previewSrc) ? <p role="alert" className="text-xs text-red-600">Unsupported image URL. Upload the image or use an approved image host.</p> : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <WpLabeledField label="Image URL" htmlFor={`${inputId}-url`}>
        <Input
          id={`${inputId}-url`}
          className="font-mono text-xs"
          value={imageUrl}
          onChange={(e) => onImageUrlChange(e.target.value)}
          placeholder="https://… or /images/… (blank uses automatic image)"
        />
      </WpLabeledField>
      <WpLabeledField label="Alt text" htmlFor={`${inputId}-alt`}>
        <Input id={`${inputId}-alt`} value={altText} onChange={(e) => onAltTextChange(e.target.value)} />
      </WpLabeledField>
    </div>
  );
}
