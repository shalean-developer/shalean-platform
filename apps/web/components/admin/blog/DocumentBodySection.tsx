"use client";

import { useState, type ReactNode } from "react";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import { Button } from "@/components/ui/button";

// The ordered schema is the editor model. Never flatten structured blocks into HTML.
export function DocumentBodySection({ blocks, onBlocksChange, renderBlock, newBlock }: {
  blocks: BlogContentBlock[];
  onBlocksChange: (blocks: BlogContentBlock[]) => void;
  renderBlock: (block: BlogContentBlock, index: number, onChange: (block: BlogContentBlock) => void) => ReactNode;
  newBlock: (type: "rich_text" | "image" | "faq" | "internal_links" | "comparison_table" | "section") => BlogContentBlock;
}) {
  const [type, setType] = useState<Parameters<typeof newBlock>[0]>("rich_text");
  function move(index: number, direction: number) {
    const next = [...blocks]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onBlocksChange(next);
  }
  return <section aria-label="Article body" className="space-y-4 p-4">
    <p className="text-sm text-zinc-500">Blocks appear in this order. Existing block types, anchors and placement are preserved.</p>
    {blocks.map((block, index) => <fieldset key={block.id ?? index} className="space-y-3 rounded border p-3">
      <legend className="px-1 text-sm font-medium">{index + 1}. {block.type.replaceAll("_", " ")}</legend>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => move(index,-1)} aria-label={`Move block ${index + 1} up`}>Move up</Button>
        <Button type="button" size="sm" variant="outline" disabled={index === blocks.length - 1} onClick={() => move(index,1)} aria-label={`Move block ${index + 1} down`}>Move down</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { if (window.confirm(`Remove block ${index + 1}?`)) onBlocksChange(blocks.filter((_, i) => i !== index)); }}>Remove</Button>
      </div>
      {renderBlock(block,index,next => onBlocksChange(blocks.map((b,i) => i === index ? next : b)))}
    </fieldset>)}
    <div className="flex flex-wrap gap-2">
      <select aria-label="New block type" value={type} onChange={e => setType(e.target.value as typeof type)} className="rounded border p-2">
        <option value="rich_text">Rich text</option><option value="section">Section</option><option value="image">Image</option>
        <option value="faq">FAQ</option><option value="internal_links">Internal links</option><option value="comparison_table">Comparison table</option>
      </select>
      <Button type="button" onClick={() => onBlocksChange([...blocks,newBlock(type)])}>Add block</Button>
    </div>
  </section>;
}
