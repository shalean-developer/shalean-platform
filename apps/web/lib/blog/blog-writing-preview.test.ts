// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlogContentJson } from "./content-json";
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/office/blog/fixture" }));
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: { id: "editor" } } }), getSession: async () => ({ data: { session: { access_token: "test-fixture" } } }) } }) }));
import { WordPressPostEditorLayout } from "@/components/admin/blog/WordPressPostEditorLayout";
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";
import { BlogArticlePreview } from "@/components/admin/blog/BlogArticlePreview";
import { BlogDbArticleBody } from "@/components/blog/BlogDbArticleBody";
import { BlogHero } from "@/components/blog/engine/BlogHero";
const content: BlogContentJson = { schema_version: 1, blocks: [
  { id: "body", type: "rich_text", html: '<h2>Kitchen surfaces</h2><p>Use a soft cloth. <strong>Test first.</strong></p>' },
  { id: "faq", type: "faq", items: [{ question: "Can I clean painted cabinets?", answer: "Test a small hidden area first." }] },
] };
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); root = undefined; container = undefined; localStorage.clear(); vi.unstubAllGlobals(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });

describe("writing to preview", () => {
  it.each(["draft", "published"])("previews unsaved %s edits without saving or publishing and retains the writing session", async status => {
    const request = vi.fn(async (url: string, _init?: RequestInit) => new Response(JSON.stringify(url.endsWith("/taxonomy") ? { categories: [], tags: [] } : { post: { id: "fixture", slug: "fixture", title: "Saved title", status, content_json: content, updated_at: "2026-10-20T12:00:00Z" } }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(PostEditorForm, { mode: "edit", postId: "fixture" })));
    const writingNode = container.querySelector(".ProseMirror");
    const title = container.querySelector("#wp-post-title") as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(title, "Current unsaved title"); title.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => [...container!.querySelectorAll("button")].find(button => button.textContent === "Settings")!.click());
    const settings = container.querySelector('[aria-label="Post settings"]')!;
    expect(settings.hasAttribute("hidden")).toBe(false);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(settings.hasAttribute("hidden")).toBe(true);
    await act(async () => [...container!.querySelectorAll("button")].find(button => button.textContent === "Settings")!.click());
    await act(async () => [...container!.querySelectorAll("button")].find(button => button.textContent === "Preview")!.click());
    expect(settings.hasAttribute("hidden")).toBe(true);
    const preview = container.querySelector('[aria-label="Article preview"]')!;
    expect(preview.querySelector("h1")?.textContent).toBe("Current unsaved title");
    expect(preview.textContent).toContain("Can I clean painted cabinets?");
    expect(preview.textContent).not.toMatch(/Published 20/);
    expect(request.mock.calls.every(args => args.length === 1 || !(args[1] as RequestInit)?.method || (args[1] as RequestInit).method === "GET")).toBe(true);
    await act(async () => [...container!.querySelectorAll("button")].find(button => button.textContent === "Write")!.click());
    expect(container.querySelector(".ProseMirror")).toBe(writingNode);
    expect((container.querySelector("#wp-post-title") as HTMLTextAreaElement).value).toBe("Current unsaved title");
    expect(container.textContent).toContain("Unsaved changes");
  });
  it("keeps settings, saved-version access and preview available while editing is read-only", async () => {
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(WordPressPostEditorLayout, { mode: "edit", postsListPath: "/office/blog", saving: false, disabled: true, status: "draft", onSave: vi.fn(), formError: null, fieldErrors: [], title: "Read-only post", onTitleChange: vi.fn(), slug: "read-only", onSlugChange: vi.fn(), slugAuto: false, onSlugAutoChange: vi.fn(), permalinkPreview: "/blog/read-only", viewPostUrl: "/blog/read-only", body: createElement("textarea", { "aria-label": "Stored content" }), sidebar: createElement("input", { "aria-label": "Stored metadata", defaultValue: "Keep this" }), preview: createElement("p", null, "Read-only preview") })));
    const settingsButton = [...container.querySelectorAll("button")].find(button => button.textContent === "Settings")!;
    expect(settingsButton.matches(":disabled")).toBe(false);
    await act(async () => settingsButton.click());
    expect(container.querySelector('[aria-label="Post settings"]')?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector('[aria-label="Stored metadata"]')?.matches(":disabled")).toBe(true);
    expect(container.querySelector('a[target="_blank"]')?.textContent).toContain("Open saved version");
    await act(async () => [...container!.querySelectorAll("button")].find(button => button.textContent === "Preview")!.click());
    expect(container.textContent).toContain("Read-only preview");
    expect([...container.querySelectorAll("button")].find(button => button.textContent === "Save draft")?.matches(":disabled")).toBe(true);
  });
  it("starts new posts with a writable empty canvas without adding saved content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ categories: [], tags: [] }))));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(PostEditorForm, { mode: "create" })));
    expect(container.querySelector('[role="textbox"][aria-label="Article rich text"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Post settings"]')?.hasAttribute("hidden")).toBe(true);
    expect(container.textContent).toContain("No article text yet");
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:new")).toBeNull();
  });
  it("uses the same body rendering for preview and public content, preserving order and sanitization", () => {
    const before = JSON.stringify(content);
    const publicBody = renderToStaticMarkup(createElement(BlogDbArticleBody, { content, autoLinkSlug: "fixture" }));
    const preview = renderToStaticMarkup(createElement(BlogArticlePreview, { title: "Guide", excerpt: "", slug: "fixture", featuredUrl: "", featuredAlt: "", content, wordCount: 30 }));
    const stableIds = (markup: string) => markup.replace(/radix-_R_[a-zA-Z0-9]+_/g, "radix-id");
    expect(stableIds(preview)).toContain(stableIds(publicBody));
    expect(preview.indexOf("Can I clean painted cabinets?")).toBeLessThan(preview.indexOf("Get your cleaning quote"));
    expect(preview.match(/Get your cleaning quote in Cape Town/g)).toHaveLength(1);
    expect(JSON.stringify(content)).toBe(before);
  });
  it("omits the known placeholder instead of expanding it into a grey hero", () => {
    expect(renderToStaticMarkup(createElement(BlogHero, { src: "/images/default-cleaning.jpg", alt: "Placeholder" }))).toBe("");
  });
  it("opens the toolbar inserter, edits a new image in place, undoes it, and closes on outside interaction", async () => {
    // JSDOM has no Range layout; ProseMirror uses these only to scroll after Undo.
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/taxonomy") ? { categories: [], tags: [] } : { post: { id: "fixture", slug: "fixture", title: "Saved title", status: "draft", content_json: content, updated_at: "2026-10-20T12:00:00Z" } }), { headers: { "Content-Type": "application/json" } })));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(PostEditorForm, { mode: "edit", postId: "fixture" })));
    const insert = container.querySelector('button[aria-label="Insert block"]') as HTMLButtonElement;
    await act(async () => insert.click());
    expect(container.querySelector('[role="dialog"][aria-label="Insert a block"]')).not.toBeNull();
    await act(async () => (container!.querySelector('button[data-block-type="image"]') as HTMLButtonElement).click());
    expect(container.querySelector('[role="dialog"][aria-label="Insert a block"]')).toBeNull();
    expect(container.textContent).toContain("Done editing");
    expect(container.textContent).toContain("Can I clean painted cabinets?");
    await act(async () => (container!.querySelector('button[aria-label="Undo"]') as HTMLButtonElement).click());
    expect(container.textContent).not.toContain("Done editing");
    expect(container.textContent).toContain("Kitchen surfaces");
    await act(async () => insert.click());
    await act(async () => container!.querySelector("#wp-post-title")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="dialog"][aria-label="Insert a block"]')).toBeNull();
  });

});
