"use client";

import { useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, MoreHorizontal, Trash2 } from "lucide-react";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

// The ordered schema is the editor model. Never flatten structured blocks into HTML.
export function DocumentBodySection({ blocks, onBlocksChange, renderBlock, newBlock }: {
  blocks: BlogContentBlock[];
  onBlocksChange: (blocks: BlogContentBlock[]) => void;
  renderBlock: (block: BlogContentBlock, index: number, onChange: (block: BlogContentBlock) => void) => ReactNode;
  newBlock: (type: "rich_text" | "image" | "faq" | "internal_links" | "comparison_table" | "section") => BlogContentBlock;
}) {
  const [type, setType] = useState<Parameters<typeof newBlock>[0]>("rich_text");
  const [removed, setRemoved] = useState<{ block: BlogContentBlock; index: number }[]>([]);
  function move(index: number, direction: number) {
    const next = [...blocks]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onBlocksChange(next);
  }
  function undoRemove() {
    const last = removed.at(-1);
    if (!last) return;
    if (!last.block.id || !blocks.some(b => b.id === last.block.id)) {
      const next = [...blocks];
      next.splice(Math.min(last.index, next.length), 0, last.block);
      onBlocksChange(next);
    }
    setRemoved(prev => prev.slice(0, -1));
  }
  return <section aria-label="Article body" className="space-y-5 p-4 sm:p-5">
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Write your article below. Use the arrows to reorder sections.</p>
    {removed.length > 0 ? <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <span>Block removed. You can restore it while this editor is open.</span>
      <Button type="button" size="sm" variant="outline" onClick={undoRemove}>Undo removal</Button>
    </div> : null}
    {blocks.map((block, index) => <fieldset key={block.id ?? index} className="min-w-0 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <legend className="sr-only">{index + 1}. {block.type.replaceAll("_", " ")}</legend>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
        <span className="text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">{index + 1}. {block.type.replaceAll("_", " ")}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" className="h-8 w-8 p-0" variant="ghost" disabled={index === 0} onClick={() => move(index,-1)} aria-label={`Move block ${index + 1} up`} title="Move up"><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" size="sm" className="h-8 w-8 p-0" variant="ghost" disabled={index === blocks.length - 1} onClick={() => move(index,1)} aria-label={`Move block ${index + 1} down`} title="Move down"><ArrowDown className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="sm" className="h-8 w-8 p-0" variant="ghost" aria-label={`Block ${index + 1} actions`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => {
              setRemoved(prev => [...prev, { block, index }]);
              onBlocksChange(blocks.filter((_, i) => i !== index));
            }}><Trash2 className="mr-2 h-4 w-4" />Remove block</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {renderBlock(block,index,next => onBlocksChange(blocks.map((b,i) => i === index ? next : b)))}
    </fieldset>)}
    <div className="flex flex-wrap gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <select aria-label="New block type" value={type} onChange={e => setType(e.target.value as typeof type)} className="rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
        <option value="rich_text">Rich text</option><option value="section">Section</option><option value="image">Image</option>
        <option value="faq">FAQ</option><option value="internal_links">Internal links</option><option value="comparison_table">Comparison table</option>
      </select>
      <Button type="button" onClick={() => onBlocksChange([...blocks,newBlock(type)])}>Add block</Button>
    </div>
  </section>;
}
