// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const state = vi.hoisted(() => ({ lookup: null as null | Promise<{ data: { user: { id: string } | null } }> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowser: () => ({ auth: { getUser: () => state.lookup, getSession: async () => ({ data: { session: { access_token: "test-fixture" } } }) } }) }));
import { PostEditorForm } from "@/components/admin/blog/PostEditorForm";
let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); root = null; container = null; vi.unstubAllGlobals(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); vi.restoreAllMocks(); });

async function loadEditor(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/taxonomy") ? { categories: [], tags: [] } : { post: { id: "fixture", slug: "fixture", title: "Server title", status: "draft", content_json: { schema_version: 1, blocks: [] }, updated_at: "2026-10-20T12:00:00Z", ...overrides } }), { headers: { "Content-Type": "application/json" } })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(PostEditorForm, { mode: "edit", postId: "fixture" })));
}
async function editTitle(value = "Unsaved new title") {
  const input = container!.querySelector('#wp-post-title') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("blog save state with delayed recovery identity", () => {
  it("clears the recovery copy after edits are undone back to the saved version", async () => {
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    await loadEditor(); await editTitle();
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture")).toContain("Unsaved new title");
    await editTitle("Server title");
    expect(container!.textContent).not.toContain("Unsaved changes");
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture")).toBeNull();
  });
  it("keeps edits unsaved when identity arrives after editing", async () => {
    let resolve!: (value: { data: { user: { id: string } | null } }) => void;
    state.lookup = new Promise(done => { resolve = done; });
    await loadEditor(); await editTitle();
    expect(container!.textContent).toContain("Unsaved changes");
    await act(async () => resolve({ data: { user: { id: "editor" } } }));
    expect(container!.textContent).toContain("Unsaved changes");
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture")).toContain("Unsaved new title");
  });
  it("keeps edits unsaved when identity lookup fails", async () => {
    let reject!: (error: Error) => void;
    state.lookup = new Promise((_done, fail) => { reject = fail; });
    await loadEditor(); await editTitle();
    await act(async () => reject(new Error("Session lookup failed")));
    expect(container!.textContent).toContain("Unsaved changes");
    expect(container!.textContent).toContain("Your edits stay in this page");
  });
  it("locks writing and saving until recovery is resolved, while keeping the choices usable", async () => {
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Recovered title", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } }));
    await loadEditor();
    expect(container!.textContent).toContain("Recovery needs review");
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).matches(":disabled")).toBe(true);
    expect(container!.querySelector('.ProseMirror')?.getAttribute("contenteditable")).toBe("false");
    const buttons = Array.from(container!.querySelectorAll("button"));
    expect(buttons.find(button => button.textContent === "Save draft")!.matches(":disabled")).toBe(true);
    expect(buttons.find(button => button.textContent === "Restore recovered work")!.matches(":disabled")).toBe(false);
    await act(async () => buttons.find(button => button.textContent === "Keep server version")!.click());
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).matches(":disabled")).toBe(false);
    expect(container!.textContent).not.toContain("Recovery needs review");
  });
  it("preserves early edits durably when a delayed recovery copy is restored, including after reload", async () => {
    let resolve!: (value: { data: { user: { id: string } } }) => void;
    state.lookup = new Promise(done => { resolve = done; });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Recovered older title", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } }));
    await loadEditor(); await editTitle("New writing before lookup completed");
    await act(async () => resolve({ data: { user: { id: "editor" } } }));
    await act(async () => Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore recovered work")!.click());
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).value).toBe("Recovered older title");
    expect(JSON.parse(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture:before-restore")!).snapshot.title).toBe("New writing before lookup completed");
    await act(async () => root!.unmount()); container!.remove(); root = null; container = null;
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    await loadEditor();
    expect(container!.textContent).toContain("Restore other browser copy");
    await act(async () => Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore other browser copy")!.click());
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).value).toBe("New writing before lookup completed");
    expect(JSON.parse(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture:before-restore")!).snapshot.title).toBe("Recovered older title");
  });
  it("retains the current writing if browser storage cannot preserve both copies", async () => {
    let resolve!: (value: { data: { user: { id: string } } }) => void;
    state.lookup = new Promise(done => { resolve = done; });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Recovered older title", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } }));
    await loadEditor(); await editTitle("Keep this newer writing");
    await act(async () => resolve({ data: { user: { id: "editor" } } }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    await act(async () => Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore recovered work")!.click());
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).value).toBe("Keep this newer writing");
    expect(container!.textContent).toContain("Could not preserve both browser copies");
    expect(container!.textContent).toContain("Recovery needs review");
  });

  it("clears both browser copies only after an acknowledged server save", async () => {
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture:before-restore", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Earlier writing" } }));
    await loadEditor(); await editTitle("Saved writing");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ post: { id: "fixture", slug: "fixture", title: "Saved writing", status: "draft", content_json: { schema_version: 1, blocks: [] }, updated_at: "2026-10-20T13:00:00Z" }, receipt: { saved_at: "2026-10-20T13:00:00Z" } }), { headers: { "Content-Type": "application/json" } })));
    await act(async () => Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Save draft")!.click());
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture")).toBeNull();
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture:before-restore")).toBeNull();
    expect(container!.textContent).not.toContain("Restore other browser copy");
    expect(container!.textContent).toContain("Saved");
  });
  it("keeps retired records read-only when a stored recovery copy exists", async () => {
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Older editable copy", retired: false } }));
    await loadEditor({ retired: true });
    const restore = Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore recovered work")!;
    expect(restore.disabled).toBe(true);
    expect(container!.querySelector("#wp-post-title")!.matches(":disabled")).toBe(true);
    expect(Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Save draft")!.disabled).toBe(true);
  });

  it("still offers a valid recovery draft when an older backup cannot be parsed", async () => {
    state.lookup = Promise.resolve({ data: { user: { id: "editor" } } });
    const saved = JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Valid recovered writing", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", saved);
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture:before-restore", "invalid json");
    await loadEditor();
    expect(container!.textContent).toContain("Recovery needs review");
    expect(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture")).toBe(saved);
    expect(Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore recovered work")).toBeDefined();
  });
  it("requires the current late edits to be resolved before switching to a third stored copy", async () => {
    let resolve!: (value: { data: { user: { id: string } } }) => void;
    state.lookup = new Promise(done => { resolve = done; });
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Recovered main copy", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } }));
    localStorage.setItem("shalean.blog.recovery.v1:editor:fixture:before-restore", JSON.stringify({ savedAt: Date.now(), snapshot: { title: "Older other copy", slug: "fixture", status: "draft", content_json: { schema_version: 1, blocks: [] } } }));
    await loadEditor(); await editTitle("Latest writing before lookup");
    await act(async () => resolve({ data: { user: { id: "editor" } } }));
    expect(Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore other browser copy")!.disabled).toBe(true);
    expect((container!.querySelector("#wp-post-title") as HTMLTextAreaElement).value).toBe("Latest writing before lookup");
    await act(async () => Array.from(container!.querySelectorAll("button")).find(button => button.textContent === "Restore recovered work")!.click());
    expect(JSON.parse(localStorage.getItem("shalean.blog.recovery.v1:editor:fixture:before-restore")!).snapshot.title).toBe("Latest writing before lookup");
  });

});
