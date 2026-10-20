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
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); root = null; container = null; vi.unstubAllGlobals(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); });

async function loadEditor() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/taxonomy") ? { categories: [], tags: [] } : { post: { id: "fixture", slug: "fixture", title: "Server title", status: "draft", content_json: { schema_version: 1, blocks: [] }, updated_at: "2026-10-20T12:00:00Z" } }), { headers: { "Content-Type": "application/json" } })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(PostEditorForm, { mode: "edit", postId: "fixture" })));
}
async function editTitle(value = "Unsaved new title") {
  const input = container!.querySelector('#wp-post-title') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
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
});
