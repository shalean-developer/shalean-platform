"use client";

import { useEffect, useId, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Extension, Node, type Editor } from "@tiptap/core";
import { DOMParser, DOMSerializer, type Node as ProseNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Bold, Italic, List, ListOrdered, Undo2, Redo2, Link2, ImageIcon, ArrowUp, ArrowDown, Trash2, Plus, X } from "lucide-react";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";
import { legacyParagraphToRichHtml } from "@/lib/blog/legacy-paragraph-to-rich-html";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";
import { Button } from "@/components/ui/button";
import { prompt } from "@/components/ui/notifications";
import { useBlogMediaUpload } from "./useBlogMediaUpload";
import "./rich-text-editor.css";
import "@/components/blog/blog-article-typography.css";

type AddType = "rich_text" | "image" | "faq" | "internal_links" | "comparison_table" | "section";
type Props = {
  blocks: BlogContentBlock[];
  onBlocksChange: (blocks: BlogContentBlock[]) => void;
  renderBlock: (block: BlogContentBlock, index: number, change: (block: BlogContentBlock) => void) => ReactNode;
  newBlock: (type: AddType) => BlogContentBlock;
  uploadSlug?: string;
  disabled?: boolean;
  wordCount?: number;
};
const names: Record<string, string> = { rich_text: "Article text", section: "Section", image: "Image", faq: "Questions and answers", internal_links: "Related links", comparison_table: "Comparison table" };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function proseHtml(block: BlogContentBlock): string | null {
  if (block.type === "rich_text") return /<(?:table|footer)\b/i.test(block.html) ? null : sanitizeBlogRichHtml(block.html);
  if (block.type === "section") return `<h${block.heading_level ?? 2}>${escape(block.title)}</h${block.heading_level ?? 2}>${legacyParagraphToRichHtml(block.content)}`;
  if (block.type === "heading") return `<h${Math.max(2, block.level)}>${escape(block.content)}</h${Math.max(2, block.level)}>`;
  if (block.type === "paragraph" || block.type === "intro" || block.type === "quick_answer") return legacyParagraphToRichHtml(block.content);
  return null;
}
export function blogDocumentHtml(blocks: BlogContentBlock[]): string {
  return blocks.map((block, index) => {
    const html = proseHtml(block);
    return html === null ? `<div data-blog-atomic="${index}"></div>` : `<div data-blog-text="${index}">${html || "<p></p>"}</div>`;
  }).join("");
}
function fragmentHtml(node: ProseNode, editor: Editor): string {
  const element = document.createElement("div");
  element.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(node.content));
  return element.innerHTML;
}
function moveNode(props: NodeViewProps, direction: -1 | 1) {
  const position = props.getPos();
  if (typeof position !== "number") return;
  const siblings: { node: ProseNode; pos: number }[] = [];
  props.editor.state.doc.forEach((node, pos) => siblings.push({ node, pos }));
  const index = siblings.findIndex(item => item.pos === position);
  const target = siblings[index + direction];
  if (!target) return;
  const transaction = closeHistory(props.editor.state.tr).delete(position, position + props.node.nodeSize);
  transaction.insert(direction < 0 ? target.pos : position + target.node.nodeSize, props.node);
  props.editor.view.dispatch(transaction);
}
function BlockActions(props: NodeViewProps) {
  const block = props.node.attrs.original as BlogContentBlock;
  return <div contentEditable={false} className="blog-node-controls mb-1 flex justify-end gap-1 text-xs" aria-label={`${names[block.type] ?? block.type} controls`}>
    <Button type="button" size="sm" variant="ghost" className="blog-node-action" aria-label={`Move ${names[block.type] ?? block.type} up`} onClick={() => moveNode(props, -1)}><ArrowUp className="size-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" className="blog-node-action" aria-label={`Move ${names[block.type] ?? block.type} down`} onClick={() => moveNode(props, 1)}><ArrowDown className="size-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" className="blog-node-action" aria-label={`Remove ${names[block.type] ?? block.type}`} onClick={() => { const pos = props.getPos(); if (typeof pos === "number") props.editor.view.dispatch(closeHistory(props.editor.state.tr).delete(pos, pos + props.node.nodeSize)); }}><Trash2 className="size-3.5" /></Button>
  </div>;
}
function TextBlockView(props: NodeViewProps) {
  return <NodeViewWrapper className="blog-text-node relative"><BlockActions {...props} /><NodeViewContent /></NodeViewWrapper>;
}
function StructuredBlockView(props: NodeViewProps) {
  const block = props.node.attrs.original as BlogContentBlock;
  const [editing, setEditing] = useState(() => {
    if (block.type === "image") return !block.url;
    if (block.type === "faq") return !block.items.some(item => item.question || item.answer);
    if (block.type === "internal_links") return !block.links.some(link => link.label.trim());
    if (block.type === "comparison_table") return block.rows.every(row => row.every(cell => !cell.trim()));
    return false;
  });
  const render = props.extension.options.renderBlock as Props["renderBlock"];
  return <NodeViewWrapper contentEditable={false} className="blog-structured-node">
    <BlockActions {...props} />
    <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-500">{names[block.type] ?? block.type.replaceAll("_", " ")}</span><Button type="button" size="sm" variant="outline" onClick={() => { const position = props.getPos(); if (typeof position === "number") props.editor.commands.setNodeSelection(position); setEditing(!editing); }}>{editing ? "Done editing" : `Edit ${names[block.type] ?? "section"}`}</Button></div>
    {editing ? render(block, 0, next => props.updateAttributes({ original: next })) : <BlogContentRenderer content={{ schema_version: 1, blocks: [block] }} />}
  </NodeViewWrapper>;
}

export function blogDocumentNodes(source: ((index: number) => BlogContentBlock) | MutableRefObject<BlogContentBlock[]>, fieldRenderer: Props["renderBlock"] | MutableRefObject<Props["renderBlock"]>) {
  const getOriginal = (index: number) => typeof source === "function" ? source(index) : source.current[index];
  const renderBlock: Props["renderBlock"] = (block, index, change) => typeof fieldRenderer === "function" ? fieldRenderer(block, index, change) : fieldRenderer.current(block, index, change);
  return [
      Node.create({ name: "blogText", group: "block", content: "block+", defining: true,
        addAttributes: () => ({ original: { default: null, rendered: false } }),
        parseHTML: () => [{ tag: "div[data-blog-text]", getAttrs: element => { const index = element.getAttribute("data-blog-text") ?? ""; const original = /^\d+$/.test(index) ? getOriginal(Number(index)) : undefined; return original ? { original } : false; } }],
        renderHTML: () => ["div", { "data-blog-text": "" }, 0],
        addNodeView: () => ReactNodeViewRenderer(TextBlockView),
      }),
      Node.create({ name: "blogAtomic", group: "block", atom: true,
        addOptions: () => ({ renderBlock: (block: BlogContentBlock, index: number, update: (block: BlogContentBlock) => void) => renderBlock(block, index, update) }),
        addAttributes: () => ({ original: { default: null, rendered: false } }),
        parseHTML: () => [{ tag: "div[data-blog-atomic]", getAttrs: element => { const index = element.getAttribute("data-blog-atomic") ?? ""; const original = /^\d+$/.test(index) ? getOriginal(Number(index)) : undefined; return original ? { original } : false; } }],
        renderHTML: () => ["div", { "data-blog-atomic": "" }],
        addNodeView: () => ReactNodeViewRenderer(StructuredBlockView),
      }),
  ];
}

export function blogDocumentBaseline(editor: Editor): Map<string, string> {
  const baseline = new Map<string, string>();
  editor.state.doc.forEach(node => { if (node.type.name === "blogText") baseline.set(JSON.stringify(node.attrs.original), fragmentHtml(node, editor)); });
  return baseline;
}

export function serializeBlogDocument(current: Editor, baseline: ReadonlyMap<string, string>, bareIds = new Map<number, string>()): BlogContentBlock[] {
  const next: BlogContentBlock[] = [];
  current.state.doc.forEach((node, _offset, index) => {
    const original = node.attrs.original as BlogContentBlock | undefined;
    if (node.type.name === "blogAtomic" && original) { next.push(original); return; }
    if (node.type.name === "blogText" && original) {
      const html = fragmentHtml(node, current);
      let originalHtml = baseline.get(JSON.stringify(original));
      if (originalHtml === undefined) {
        const element = document.createElement("div"); element.innerHTML = proseHtml(original) || "<p></p>";
        const parsed = DOMParser.fromSchema(current.schema).parse(element);
        originalHtml = fragmentHtml(parsed, current);
      }
      if (html === originalHtml) next.push(original);
      else next.push({ ...(original.type === "rich_text" ? original : { id: original.id }), type: "rich_text", html });
      return;
    }
    const element = document.createElement("div"); element.append(DOMSerializer.fromSchema(current.schema).serializeNode(node));
    if (!bareIds.has(index)) bareIds.set(index, crypto.randomUUID());
    next.push({ id: bareIds.get(index), type: "rich_text", html: element.innerHTML });
  });
  return next;
}

type StructuralFormat = "paragraph" | "bulletList" | "orderedList" | "blockquote" | 2 | 3 | 4;

/** Apply formatting to prose ranges independently, leaving structured nodes intact. */
export function blogFormattingTargets(editor: Editor): { from: number; to: number }[] {
  const { selection, doc } = editor.state;
  const ranges: { from: number; to: number }[] = [];
  doc.forEach((top, start) => {
    if (top.type.name === "blogAtomic" || top.type.name === "image") return;
    let group: { from: number; to: number } | null = null;
    const visit = (node: ProseNode, position: number) => {
      if (node.type.name === "image" || node.type.name === "blogAtomic") { group = null; return false; }
      if (!node.isTextblock) return true;
      const from = Math.max(selection.from, position + 1);
      const to = Math.min(selection.to, position + node.nodeSize - 1);
      if (from <= to) {
        if (group) group.to = to;
        else { group = { from, to }; ranges.push(group); }
      }
      return false;
    };
    if (top.isTextblock) visit(top, start);
    else top.descendants((node, position) => visit(node, start + 1 + position));
  });
  return ranges;
}

export function formatBlogSelection(editor: Editor, format: StructuralFormat): boolean {
  const targets = blogFormattingTargets(editor);
  if (!targets.length) return false;
  const bookmark = editor.state.selection.getBookmark();
  const chain = editor.chain().focus();
  const listType = format === "bulletList" || format === "orderedList" || format === "blockquote" ? format : null;
  const alreadyFormatted = targets.map(range => {
    let all = Boolean(listType);
    editor.state.doc.nodesBetween(range.from, range.to, (node, position) => {
      if (!node.isTextblock) return true;
      const point = editor.state.doc.resolve(position + 1);
      let matching = false;
      for (let depth = 1; depth <= point.depth; depth++) if (point.node(depth).type.name === listType) matching = true;
      if (!matching) all = false;
      return false;
    });
    return all;
  });
  const removeFormat = alreadyFormatted.every(Boolean);
  // Work backwards so earlier document positions remain stable. One transaction
  // makes the complete multi-section operation one Undo step.
  for (let index = targets.length - 1; index >= 0; index--) {
    const range = targets[index];
    chain.setTextSelection(range);
    if (listType && !removeFormat && alreadyFormatted[index]) continue;
    if (format === "paragraph") chain.command(({ tr }) => {
      // Generic clearNodes/setParagraph may lift our source wrapper as well as
      // the heading. Change only the selected textblock types and keep IDs.
      tr.doc.nodesBetween(range.from, range.to, (node, position) => {
        if (node.isTextblock && node.type !== editor.schema.nodes.paragraph) tr.setNodeMarkup(position, editor.schema.nodes.paragraph, node.attrs, node.marks);
      });
      return true;
    });
    else if (format === "bulletList") chain.toggleBulletList();
    else if (format === "orderedList") chain.toggleOrderedList();
    else if (format === "blockquote") chain.toggleBlockquote();
    else chain.setHeading({ level: format });
  }
  return chain.command(({ tr }) => { tr.setSelection(bookmark.map(tr.mapping).resolve(tr.doc)); return true; }).run();
}

/** Insert after the active paragraph/list, splitting its source wrapper safely. */
export function insertBlogBlock(editor: Editor, block: BlogContentBlock): void {
  const html = proseHtml(block);
  const element = document.createElement("div");
  element.innerHTML = html || "<p></p>";
  const inserted = html === null ? editor.schema.nodes.blogAtomic.create({ original: block }) : editor.schema.nodes.blogText.create({ original: block }, DOMParser.fromSchema(editor.schema).parse(element).content);
  const { selection, doc } = editor.state;
  const end = selection.$to;
  const transaction = closeHistory(editor.state.tr);
  let position = selection.to;
  if (end.depth >= 2 && end.node(1).type.name === "blogText") {
    const source = end.node(1);
    const start = end.before(1);
    const cut = end.after(2) - start - 1;
    const before = source.content.cut(0, cut);
    const after = source.content.cut(cut);
    const preceding = source.copy(before);
    position = start + preceding.nodeSize;
    if (after.size) {
      const following = source.copy(after);
      const original: BlogContentBlock = { id: crypto.randomUUID(), type: "rich_text", html: fragmentHtml(following, editor) };
      transaction.replaceWith(start, start + source.nodeSize, [preceding, inserted, editor.schema.nodes.blogText.create({ original }, after)]);
    } else transaction.insert(position, inserted);
  } else {
    if (end.depth) position = end.after(1);
    position = Math.min(position, doc.content.size);
    transaction.insert(position, inserted);
  }
  transaction.setSelection(inserted.type.name === "blogAtomic" ? NodeSelection.create(transaction.doc, position) : TextSelection.near(transaction.doc.resolve(position + 1)));
  editor.view.dispatch(transaction.scrollIntoView());
}

export const BlogAnchors = Extension.create({ name: "blogAnchors", addGlobalAttributes() { return [{ types: ["heading", "paragraph", "blockquote"], attributes: { id: { default: null, parseHTML: element => element.getAttribute("id"), renderHTML: attrs => attrs.id ? { id: attrs.id } : {} } } }]; } });

export const BlogDocumentBoundaries = Extension.create({
  name: "blogDocumentBoundaries",
  priority: 2000,
  addKeyboardShortcuts() {
    const apply = (format: StructuralFormat) => () => { formatBlogSelection(this.editor, format); return true; };
    return { "Mod-Shift-8": apply("bulletList"), "Mod-Shift-7": apply("orderedList"), "Mod-Shift-b": apply("blockquote"), "Mod-Alt-0": apply("paragraph"), "Mod-Alt-2": apply(2), "Mod-Alt-3": apply(3), "Mod-Alt-4": apply(4) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ filterTransaction(transaction) {
      if (!transaction.docChanged) return true;
      let valid = true;
      transaction.doc.descendants((node, _position, parent) => {
        if ((node.type.name === "blogText" || node.type.name === "blogAtomic") && parent?.type.name !== "doc") { valid = false; return false; }
        return true;
      });
      return valid;
    } })];
  },
});

/** One editable document. Source objects are retained for every untouched block. */
export function ArticleDocumentEditor({ blocks, onBlocksChange, renderBlock, newBlock, uploadSlug, disabled = false, wordCount = 0 }: Props) {
  const [blank] = useState(() => newBlock("rich_text"));
  const [seed] = useState(() => blocks.length ? blocks : [blank]);
  const initial = useRef(seed);
  const [initialHtml] = useState(() => blogDocumentHtml(seed));
  const change = useRef(onBlocksChange);
  const fields = useRef(renderBlock);
  const emitted = useRef(JSON.stringify(blocks));
  const baseline = useRef(new Map<string, string>());
  const bareIds = useRef(new Map<number, string>());
  const input = useRef<HTMLInputElement>(null);
  const [inserterOpen, setInserterOpen] = useState(false);
  const inserterId = useId();
  const inserterButton = useRef<HTMLButtonElement>(null);
  const inserterPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inserterOpen) return;
    inserterPanel.current?.querySelector<HTMLButtonElement>("button[data-block-type]")?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as globalThis.Node;
      if (!inserterPanel.current?.contains(target) && !inserterButton.current?.contains(target)) setInserterOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [inserterOpen]);
  const { uploadFile, uploading, error } = useBlogMediaUpload();
  const [imageError, setImageError] = useState("");
  useEffect(() => { change.current = onBlocksChange; fields.current = renderBlock; }, [onBlocksChange, renderBlock]);
  const [documentNodes] = useState(() => blogDocumentNodes(initial, fields));
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      BlogDocumentBoundaries,
      ...documentNodes,
      BlogAnchors,
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, trailingNode: false, link: false, code: false, codeBlock: false }),
      Link.configure({ openOnClick: false }), Image.configure({ allowBase64: false }),
    ],
    content: initialHtml,
    editable: !disabled,
    editorProps: { attributes: { role: "textbox", "aria-label": "Article rich text", "aria-multiline": "true", class: "blog-article-typography min-h-[360px] py-4 focus:outline-none" } },
    onCreate: ({ editor: created }) => {
      baseline.current = blogDocumentBaseline(created);
    },
    onUpdate: ({ editor: current }) => {
      const next = serializeBlogDocument(current, baseline.current, bareIds.current);
      emitted.current = JSON.stringify(next);
      change.current(next);
    },
  }, []);
  useEffect(() => {
    if (!editor || editor.isDestroyed || JSON.stringify(blocks) === emitted.current) return;
    initial.current = blocks.length ? blocks : [blank];
    editor.commands.setContent(blogDocumentHtml(initial.current), { emitUpdate: false });
    baseline.current = blogDocumentBaseline(editor);
    emitted.current = JSON.stringify(blocks);
  }, [blocks, blank, editor]);
  useEffect(() => { if (editor && editor.isEditable !== !disabled) editor.setEditable(!disabled, false); }, [disabled, editor]);
  const openUpload = () => input.current?.click();
  function addSection(type: AddType) {
    if (!editor || disabled) return;
    insertBlogBlock(editor, newBlock(type));
    setInserterOpen(false);
    editor.commands.focus();
  }
  function insertBlogImage(src: string, alt: string) {
    if (!editor) return;
    const selection = editor.state.selection;
    if (selection.empty && selection.$from.parent.isTextblock) editor.chain().focus().setImage({ src, alt }).run();
    else insertBlogBlock(editor, { id: crypto.randomUUID(), type: "image", url: src, alt });
  }
  async function uploadImage(file: File) {
    const result = await uploadFile(file, { folder: uploadSlug ? `inline/${uploadSlug.slice(0, 48)}` : "inline" });
    if (!result || !editor) return;
    const alt = await prompt({ title: "Image alt text", defaultValue: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") });
    if (alt !== null) insertBlogImage(result.url, alt);
  }
  async function setLink() {
    if (!editor) return;
    const href = await prompt({ title: "Link URL", defaultValue: editor.getAttributes("link").href || "https://" });
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }
  async function insertImage() {
    const src = await prompt({ title: "Image URL", defaultValue: "https://" });
    if (!src || !editor) return;
    if (!isAllowedAuthoringBlogImageSrc(src)) { setImageError("Upload this image or choose a supported image URL."); return; }
    const alt = await prompt({ title: "Image alt text", defaultValue: "" });
    if (alt !== null) { insertBlogImage(src, alt); setImageError(""); }
  }
  if (!editor) return <p className="p-4 text-sm text-zinc-500">Opening writing canvas…</p>;
  const canFormat = blogFormattingTargets(editor).length > 0;
  const button = (label: string, icon: ReactNode, action: () => void, pressed = false) => <Button key={label} type="button" size="sm" variant={pressed ? "secondary" : "ghost"} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled || (!canFormat && label !== "Undo" && label !== "Redo")} onMouseDown={event => event.preventDefault()} onClick={action} className="blog-editor-icon-button">{icon}</Button>;
  return <section aria-label="Article body" className="rich-text-editor-root blog-writing-canvas">
    <div role="toolbar" aria-label="Rich text" className="sticky top-[var(--blog-editor-toolbar-top,124px)] z-20 flex flex-wrap items-center gap-1 border-y bg-white py-2 dark:bg-zinc-950">
      <button ref={inserterButton} type="button" className="blog-editor-icon-button" aria-label="Insert block" aria-expanded={inserterOpen} aria-controls={inserterId} disabled={disabled} onClick={() => setInserterOpen(!inserterOpen)}><Plus aria-hidden /></button>
      {inserterOpen ? <div ref={inserterPanel} id={inserterId} role="dialog" aria-label="Insert a block" className="blog-block-inserter" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setInserterOpen(false); inserterButton.current?.focus(); } }}>
        <div className="blog-block-inserter-heading"><strong>Insert a block</strong><button type="button" className="blog-inserter-close" aria-label="Close block inserter" onClick={() => { setInserterOpen(false); inserterButton.current?.focus(); }}><X className="size-4" aria-hidden /></button></div>
        {(["rich_text", "image", "faq", "internal_links", "comparison_table", "section"] as const).map(type => <button key={type} type="button" data-block-type={type} onClick={() => addSection(type)}>{names[type]}</button>)}
      </div> : null}
      <select aria-label="Paragraph style" value={editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : editor.isActive("heading", { level: 4 }) ? "4" : "paragraph"} className="h-9 rounded border bg-transparent px-2 text-sm" disabled={disabled || !canFormat} onChange={event => { const level = Number(event.target.value); formatBlogSelection(editor, level === 2 || level === 3 || level === 4 ? level : "paragraph"); }}><option value="paragraph">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option></select>
      {button("Undo", <Undo2 className="size-4" />, () => { editor.chain().focus().undo().run(); })}
      {button("Redo", <Redo2 className="size-4" />, () => { editor.chain().focus().redo().run(); })}
      {button("Bold", <Bold className="size-4" />, () => { editor.chain().focus().toggleBold().run(); }, editor.isActive("bold"))}
      {button("Italic", <Italic className="size-4" />, () => { editor.chain().focus().toggleItalic().run(); }, editor.isActive("italic"))}
      {button("Bullet list", <List className="size-4" />, () => { formatBlogSelection(editor, "bulletList"); }, editor.isActive("bulletList"))}
      {button("Numbered list", <ListOrdered className="size-4" />, () => { formatBlogSelection(editor, "orderedList"); }, editor.isActive("orderedList"))}
      {button("Link", <Link2 className="size-4" />, () => { void setLink(); }, editor.isActive("link"))}
      <Button type="button" size="sm" variant="ghost" title="Upload image from computer" aria-label="Upload image from computer" disabled={disabled || uploading} onClick={openUpload} className="blog-editor-icon-button"><ImageIcon className="size-4" /></Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void insertImage()}>Image URL</Button>
    </div>
    <input ref={input} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Inline image file" disabled={disabled || uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} />
    {error || imageError || uploading ? <p role="status" className="py-2 text-sm text-zinc-600">{uploading ? "Uploading image…" : error || imageError}</p> : null}
    {!canFormat ? <p className="py-2 text-xs text-zinc-500">Select article text to format it. Images and FAQs keep their own controls.</p> : null}
    <EditorContent editor={editor} />
    <div className="blog-canvas-footer"><button type="button" onClick={() => { setInserterOpen(true); inserterButton.current?.focus(); }}>＋ Add block</button><span aria-label="Word count">{wordCount.toLocaleString()} words</span></div>
  </section>;
}
