"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prompt } from "@/components/ui/notifications";
import { useBlogMediaUpload } from "./useBlogMediaUpload";
import "./rich-text-editor.css";

type Props = {
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  variant?: "default" | "document" | "wordpress";
  /** Optional slug — scopes in-article uploads under `inline/{slug}`. */
  uploadSlug?: string;
};

export function RichTextBlockEditor({ html, onChange, disabled, variant = "default", uploadSlug }: Props) {
  const isWordPress = variant === "wordpress";
  const isDocument = variant === "document" || isWordPress;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading: imageUploading, error: uploadError } = useBlogMediaUpload();
  const [localUploadError, setLocalUploadError] = useState<string | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          blockquote: {},
          code: false,
          codeBlock: false,
          horizontalRule: {},
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700",
          },
        }),
        Image.configure({
          allowBase64: false,
          HTMLAttributes: {
            class: "blog-inline-image rounded-lg max-w-full h-auto my-6",
          },
        }),
      ],
      content: html?.trim() ? html : "<p></p>",
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            isWordPress
              ? "px-4 py-4 text-[1.0625rem] leading-[1.75] text-zinc-800 focus:outline-none min-h-[520px] dark:text-zinc-100"
              : variant === "document"
                ? "px-5 py-5 text-[1.0625rem] leading-[1.75] text-zinc-800 focus:outline-none min-h-[480px] dark:text-zinc-100"
                : "px-4 py-4 text-[1.0625rem] leading-[1.7] text-zinc-800 focus:outline-none min-h-[220px] dark:text-zinc-100",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const cur = editor.getHTML();
    const next = html?.trim() ? html : "<p></p>";
    if (cur !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [html, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        Loading editor…
      </div>
    );
  }

  const mark = (label: string, icon: ReactNode, onPress: () => void, pressed: boolean) => (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="sm"
      className="h-8 px-2"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress()}
      aria-label={label}
      aria-pressed={pressed}
    >
      {icon}
    </Button>
  );

  const setLink = async () => {
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const url = await prompt({ title: "Link URL", defaultValue: prevUrl ?? "https://" });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImageUrl = async (src: string, alt?: string) => {
    if (!src.trim()) return;
    editor.chain().focus().setImage({ src: src.trim(), alt: alt?.trim() || "" }).run();
  };

  const onImageFile = async (file: File | null) => {
    if (!file || !editor) return;
    setLocalUploadError(null);
    const folder = uploadSlug?.trim() ? `inline/${uploadSlug.trim().slice(0, 48)}` : "inline";
    const result = await uploadFile(file, { folder });
    if (!result) {
      setLocalUploadError("Could not upload image.");
      return;
    }
    const altDefault = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    const alt =
      (await prompt({ title: "Image alt text (accessibility)", defaultValue: altDefault })) ?? altDefault;
    await insertImageUrl(result.url, alt);
  };

  const addImageFromUrl = async () => {
    const url = await prompt({ title: "Image URL", defaultValue: "https://" });
    if (url === null || !url.trim()) return;
    const alt = await prompt({ title: "Image alt text (accessibility)", defaultValue: "" });
    if (alt === null) return;
    await insertImageUrl(url, alt);
  };

  const toolbarError = localUploadError ?? uploadError;

  return (
    <div
      className={cn(
        "rich-text-editor-root overflow-hidden",
        isWordPress
          ? "border-0 bg-white dark:bg-zinc-950"
          : "rounded-xl border border-zinc-200/90 bg-zinc-50/30 dark:border-zinc-700 dark:bg-zinc-950/80",
        isDocument && "variant-document",
        isWordPress && "variant-wordpress",
      )}
    >
      <div
        className={cn(
          "sticky top-[52px] z-10 flex flex-wrap items-center gap-0.5 border-b border-zinc-200 bg-zinc-50/95 px-1 py-1 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95",
          isWordPress && "top-0",
        )}
        role="toolbar"
        aria-label="Rich text"
      >
        {mark("Undo", <Undo2 className="h-4 w-4" />, () => editor.chain().focus().undo().run(), false)}
        {mark("Redo", <Redo2 className="h-4 w-4" />, () => editor.chain().focus().redo().run(), false)}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        {mark(
          "Bold",
          <Bold className="h-4 w-4" />,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {mark(
          "Italic",
          <Italic className="h-4 w-4" />,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        {mark(
          "Heading 1",
          <Heading1 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
          editor.isActive("heading", { level: 1 }),
        )}
        {mark(
          "Heading 2",
          <Heading2 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive("heading", { level: 2 }),
        )}
        {mark(
          "Heading 3",
          <Heading3 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          editor.isActive("heading", { level: 3 }),
        )}
        {mark(
          "Heading 4",
          <Heading4 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
          editor.isActive("heading", { level: 4 }),
        )}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        {mark(
          "Bullet list",
          <List className="h-4 w-4" />,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {mark(
          "Numbered list",
          <ListOrdered className="h-4 w-4" />,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {mark(
          "Blockquote",
          <Quote className="h-4 w-4" />,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {mark(
          "Horizontal rule",
          <Minus className="h-4 w-4" />,
          () => editor.chain().focus().setHorizontalRule().run(),
          false,
        )}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void setLink()}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void onImageFile(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={imageUploading}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
          aria-label="Upload image from computer"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void addImageFromUrl()}
          aria-label="Insert image from URL"
        >
          Image URL
        </Button>
      </div>
      {toolbarError ? (
        <p className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {toolbarError}
        </p>
      ) : null}
      <EditorContent editor={editor} className={cn(disabled && "pointer-events-none opacity-60")} />
    </div>
  );
}
