// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCustomerAvatar } from "@/hooks/useCustomerAvatar";

vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-token" } } }) } }) }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("React", React);
const id = "11111111-1111-4111-8111-111111111111";
const user = (path?: string) => ({ id, user_metadata: path ? { customer_avatar_path: path } : {} }) as User;
let root: Root; let container: HTMLDivElement;
function Capture({ viewer }: { viewer: User }) { return createElement("output", null, useCustomerAvatar(viewer) ?? "initials"); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  URL.createObjectURL = vi.fn(() => "blob:synthetic-photo"); URL.revokeObjectURL = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("fetches a private photo with the session and clears it immediately when the viewer changes", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["photo"], { type: "image/webp" }) });
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(Capture, { viewer: user(`${id}/22222222-2222-4222-8222-222222222222.webp`) })));
  expect(container.textContent).toBe("blob:synthetic-photo");
  expect(fetcher).toHaveBeenCalledWith("/api/customer/avatar", expect.objectContaining({ headers: { Authorization: "Bearer synthetic-token" }, cache: "no-store" }));
  await act(async () => root.render(createElement(Capture, { viewer: { id: "different-viewer", user_metadata: {} } as User })));
  expect(container.textContent).toBe("initials");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-photo");
});

it("falls back to initials when an uploaded photo cannot be fetched", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await act(async () => root.render(createElement(Capture, { viewer: user(`${id}/22222222-2222-4222-8222-222222222222.webp`) })));
  expect(container.textContent).toBe("initials");
});
