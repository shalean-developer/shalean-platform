"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { BlogInternalLinksBlock } from "@/lib/blog/content-json";
import type { EditorLinkTarget } from "@/lib/blog/editor-link-targets";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InternalLinksEditor({ block, onChange }: { block: BlogInternalLinksBlock; onChange: (block: BlogInternalLinksBlock) => void }) {
  const id = useId();
  const [picker, setPicker] = useState<number | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<EditorLinkTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (picker !== null) searchRef.current?.focus();
  }, [picker]);
  useEffect(() => {
    if (picker === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setTargets([]);
      void (async () => {
      const session = await getSupabaseBrowser()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in again in another tab, then retry the search. Your links are retained.");
      const response = await fetch(`/api/admin/blog/link-targets?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load live pages. Try again.");
      if (!controller.signal.aborted) setTargets(data.targets ?? []);
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load live pages."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [picker, query]);
  function select(target: EditorLinkTarget) {
    const links = [...block.links];
    if (picker === "new") links.push({ label: target.label, url: target.url });
    else if (typeof picker === "number") links[picker] = { label: target.label, url: target.url };
    onChange({ ...block, links }); setPicker(null);
  }
  return <div className="space-y-3">
    <div className="space-y-1"><Label htmlFor={`${id}-title`}>Section title (optional)</Label><Input id={`${id}-title`} value={block.title ?? ""} onChange={e => onChange({ ...block, title: e.target.value || undefined })} /></div>
    {block.links.map((link, index) => <div key={index} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Link {index + 1}</span><Button type="button" size="sm" variant="ghost" onClick={() => { setPicker(null); onChange({ ...block, links: block.links.filter((_, i) => i !== index) }); }} aria-label={`Remove link ${index + 1}`}><X className="h-4 w-4" /></Button></div>
      <div className="grid gap-2 xl:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={`${id}-${index}-label`} className="text-xs">Link text</Label><Input id={`${id}-${index}-label`} value={link.label} placeholder="Describe the destination" onChange={e => onChange({ ...block, links: block.links.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} /></div>
        <div className="space-y-1"><Label htmlFor={`${id}-${index}-url`} className="text-xs">URL</Label><Input id={`${id}-${index}-url`} value={link.url} placeholder="/services/…" onChange={e => onChange({ ...block, links: block.links.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} /></div>
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => { setQuery(""); setPicker(index); }}>Choose a live page</Button>
    </div>)}
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setQuery(""); setPicker("new"); }}><Search className="mr-2 h-4 w-4" />Find a live page</Button><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...block, links: [...block.links, { label: "", url: "/" }] })}>Add URL manually</Button></div>
    {picker !== null ? <section aria-label="Choose a link destination" onKeyDown={e => { if (e.key === "Escape") setPicker(null); }} className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2"><Label htmlFor={`${id}-search`}>Search services, locations and published posts</Label><Button type="button" size="sm" variant="ghost" onClick={() => setPicker(null)} aria-label="Close link picker"><X className="h-4 w-4" /></Button></div>
      <Input ref={searchRef} id={`${id}-search`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try deep cleaning or Sea Point" />
      <p role="status" className="text-xs text-zinc-600 dark:text-zinc-400">{loading ? "Searching live pages…" : error || (targets.length ? "Selecting a page sets its URL and suggested link text. You can edit both afterwards." : "No matching pages. Change the search or enter a URL manually.")}</p>
      <ul aria-label="Available pages" className="max-h-64 space-y-1 overflow-y-auto">{targets.map(target => <li key={target.url}><button type="button" onClick={() => select(target)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-zinc-800"><span className="block font-medium">{target.label}</span><span className="block break-all text-xs text-zinc-600 dark:text-zinc-400">{target.kind} · {target.url}</span></button></li>)}</ul>
    </section> : null}
  </div>;
}
