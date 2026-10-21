// @vitest-environment jsdom
import React from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlogDocumentBoundaries, blogDocumentNodes, blogDocumentHtml, blogDocumentBaseline, serializeBlogDocument, formatBlogSelection, blogFormattingRange } from "@/components/admin/blog/ArticleDocumentEditor";
import type { BlogContentBlock } from "./content-json";
vi.stubGlobal("React", React);
const mixed: BlogContentBlock[] = [
  { id: "text", type: "rich_text", html: "<p>Article text with meaning.</p>" },
  { id: "image", type: "image", url: "/images/one.jpg", alt: "Keep image", caption: "Keep caption" },
  { id: "faq", type: "faq", omit_section_heading: true, items: [{ question: "Keep question?", answer: "Keep answer." }] },
];
let editor: Editor | undefined;
afterEach(() => { editor?.destroy(); editor = undefined; });
function setup(blocks = mixed) {
  editor = new Editor({ extensions: [BlogDocumentBoundaries, ...blogDocumentNodes(index => blocks[index], () => null), StarterKit.configure({ trailingNode: false, heading: { levels: [2, 3, 4] } }), Image], content: blogDocumentHtml(blocks) });
  return { editor, baseline: blogDocumentBaseline(editor) };
}
describe("formatting preserves structured blog content", () => {
  it.each(["bulletList", "orderedList", "blockquote", "paragraph", 2, 3, 4] as const)("does not apply %s across a mixed document", format => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    expect(blogFormattingRange(editor)).toBeNull();
    expect(formatBlogSelection(editor, format)).toBe(false);
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it.each(["Mod-Shift-8", "Mod-Shift-7", "Mod-Shift-b", "Mod-Alt-2", "Mod-Alt-3", "Mod-Alt-4", "Mod-Alt-0"])("guards keyboard formatting %s as well as toolbar controls", shortcut => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    editor.commands.keyboardShortcut(shortcut);
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("rejects a nested-source transaction even when a generic list command bypasses the toolbar", () => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    editor.commands.toggleBulletList();
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("formats selected prose while retaining the image and FAQ", () => {
    const { editor, baseline } = setup(); editor.commands.setTextSelection({ from: 2, to: 9 });
    expect(formatBlogSelection(editor, "bulletList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved[0]).toMatchObject({ id: "text", type: "rich_text" });
    expect(saved[0].type === "rich_text" && saved[0].html).toContain("<ul>");
    expect(saved.slice(1)).toEqual(mixed.slice(1));
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("lets Select All format an ordinary single prose section without losing its stable ID", () => {
    const { editor, baseline } = setup([mixed[0]]); editor.commands.selectAll();
    expect(formatBlogSelection(editor, "orderedList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ id: "text", type: "rich_text" });
    expect(saved[0].type === "rich_text" && saved[0].html).toContain("<ol>");
  });
  it("keeps node-selected images out of text-formatting commands", () => {
    const { editor, baseline } = setup(); editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
    expect(blogFormattingRange(editor)).toBeNull();
    expect(formatBlogSelection(editor, 2)).toBe(false);
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
});
