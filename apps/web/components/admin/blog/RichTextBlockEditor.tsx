"use client";

import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./rich-text-editor.css";

type Props = {
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

export function RichTextBlockEditor({ html, onChange, disabled }: Props) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class:
              "font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700",
          },
        }),
      ],
      content: html?.trim() ? html : "<p></p>",
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            "px-3 py-2 text-sm leading-relaxed text-zinc-800 focus:outline-none min-h-[140px]",
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

  const setLink = () => {
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prevUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="rich-text-editor-root rounded-md border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-zinc-200 px-1 py-1 dark:border-zinc-700"
        role="toolbar"
        aria-label="Rich text"
      >
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
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={setLink}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} className={cn(disabled && "pointer-events-none opacity-60")} />
    </div>
  );
}
