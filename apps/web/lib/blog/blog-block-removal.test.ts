// @vitest-environment jsdom
import React, { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { BlogContentBlock } from "./content-json";
import { DocumentBodySection } from "@/components/admin/blog/DocumentBodySection";
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

it("undoes removal in place without reverting subsequent edits or block metadata", async () => {
  let current: BlogContentBlock[] = [];
  function Editor() {
    const [blocks, setBlocks] = useState<BlogContentBlock[]>([
      { id: "first", type: "paragraph", content: "Before" },
      { id: "middle", type: "image", url: "/images/one.jpg", alt: "Middle image", caption: "Keep caption" },
      { id: "last", type: "paragraph", content: "After" },
    ]);
    current = blocks;
    return createElement(DocumentBodySection, { blocks, onBlocksChange: setBlocks,
      renderBlock: (block, _index, change) => block.type === "paragraph" ? createElement("button", { onClick: () => change({ ...block, content: "Edited after removal" }) }, block.content) : block.alt,
      newBlock: () => ({ type: "rich_text" as const, html: "" }),
    });
  }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Editor)));
    const trigger = container.querySelector('[aria-label="Block 2 actions"]') as HTMLElement;
    trigger.focus();
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => (document.querySelector('[role="menuitem"]') as HTMLElement).click());
    expect(current.map(block => block.id)).toEqual(["first", "last"]);
    const edit = [...container.querySelectorAll("button")].find(button => button.textContent === "After")!;
    await act(async () => edit.click());
    const undo = [...container.querySelectorAll("button")].find(button => button.textContent === "Undo removal")!;
    await act(async () => undo.click());
    expect(current.map(block => block.id)).toEqual(["first", "middle", "last"]);
    expect(current[1]).toMatchObject({ caption: "Keep caption", url: "/images/one.jpg", alt: "Middle image" });
    expect(current[2]).toMatchObject({ content: "Edited after removal" });
  } finally { await act(async () => root.unmount()); container.remove(); }
});
