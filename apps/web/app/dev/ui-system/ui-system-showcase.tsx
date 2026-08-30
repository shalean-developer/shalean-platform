"use client";

import { MoreHorizontal, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FloatingSelect } from "@/components/ui/floating-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/Section";

type AuditStatus = "Existing" | "Duplicate" | "Planned" | "Missing";

type InventoryItem = {
  name: string;
  status: AuditStatus;
  note: string;
};

const sourceInventory: InventoryItem[] = [
  { name: "Button", status: "Existing", note: "General-purpose primitive; variants currently use direct Tailwind colour classes." },
  { name: "CTAButton", status: "Duplicate", note: "Specialised marketing/booking CTA wrapper with attribution/tracking; do not replace platform behaviour during RD-P00." },
  { name: "Card", status: "Existing", note: "Composable card primitive with header, content and footer." },
  { name: "Badge", status: "Existing", note: "Generic compact label; StatusBadge remains a separate planned semantic pattern." },
  { name: "Input", status: "Existing", note: "Base text input. Canonical error/helper composition is still missing." },
  { name: "Label", status: "Existing", note: "Radix label primitive." },
  { name: "Avatar", status: "Existing", note: "Identity image/fallback primitive." },
  { name: "Accordion", status: "Existing", note: "Radix disclosure primitive." },
  { name: "Dialog", status: "Existing", note: "Radix modal/dialog primitive." },
  { name: "DropdownMenu", status: "Existing", note: "Radix action-menu primitive." },
  { name: "Command", status: "Existing", note: "Search/command-list primitive." },
  { name: "FloatingSelect", status: "Existing", note: "Custom select used by booking/room-style fields; candidate for later consolidation with Select." },
  { name: "Section", status: "Existing", note: "Marketing/hub layout primitive with ~1100px content width." },
  { name: "StatusBadge", status: "Planned", note: "Canonical state-to-appearance mapping; must not be conflated with generic Badge." },
  { name: "DataTable", status: "Missing", note: "Required global data pattern; not part of the current ui primitive set." },
  { name: "PageHeader", status: "Missing", note: "Required shared page-heading/action pattern." },
  { name: "SiteHeader", status: "Planned", note: "Canonical public navigation/header pattern to consolidate in RD-P02." },
  { name: "OfficeShell", status: "Planned", note: "Presentation consolidation only; existing Office RBAC/session behaviour remains authoritative." },
  { name: "AccountShell", status: "Planned", note: "Customer-account shell consolidation after baseline approval." },
];

const plannedGroups = [
  { title: "Foundations", items: ["Brand logo", "Logo mark", "Wordmark", "Colour tokens", "Typography scale", "Spacing scale", "Radius scale", "Shadow scale", "Container widths", "Breakpoints", "Z-index layers"] },
  { title: "Navigation & layout", items: ["PageHeader", "Section", "SiteHeader", "OfficeShell", "AccountShell", "Tabs", "Breadcrumbs"] },
  { title: "Data & feedback", items: ["DataTable", "Pagination", "FilterBar", "StatusBadge", "EmptyState", "Skeleton", "Toast", "Alert"] },
  { title: "Domain patterns", items: ["BookingSummary", "PaymentSummary", "CustomerIdentity", "CleanerIdentity", "MetricCard", "ScheduleCalendar"] },
];

const tokenSamples = [
  { name: "Primary", className: "bg-primary", value: "--primary" },
  { name: "Background", className: "bg-background border", value: "--background" },
  { name: "Muted", className: "bg-muted", value: "--muted" },
  { name: "Card", className: "bg-card border", value: "--card" },
  { name: "Border", className: "bg-border", value: "--border" },
  { name: "Destructive", className: "bg-destructive", value: "--destructive" },
];

const spacingSamples = [
  { label: "p-2", className: "p-2" },
  { label: "p-4", className: "p-4" },
  { label: "p-6", className: "p-6" },
  { label: "p-8", className: "p-8" },
] as const;

function Specimen({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-zinc-100 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/40">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: AuditStatus }) {
  const variant = status === "Existing" ? "success" : status === "Duplicate" ? "warning" : status === "Missing" ? "destructive" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function UISystemShowcase() {
  const [selectValue, setSelectValue] = useState("standard");

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>RD-P00V</Badge>
            <Badge variant="outline">Baseline audit</Badge>
            <Badge variant="warning">RD-P00 not approved</Badge>
            <Badge variant="outline">Development only</Badge>
          </div>
          <div className="max-w-4xl space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Shalean reusable UI baseline</h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Read-only visual audit for the design/rd04-platform-redesign branch. Existing platform APIs, RBAC, booking, pricing, payment, ownership and persistence logic remain authoritative. RD-P01 does not start until RD-P00 is approved.
            </p>
          </div>
        </header>

        <section className="space-y-4" aria-labelledby="audit-legend">
          <div>
            <h2 id="audit-legend" className="text-2xl font-semibold">Baseline classification</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">A truthful source inventory: Existing, Duplicate, Planned or Missing.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sourceInventory.map((item) => (
              <Card key={item.name}>
                <CardContent className="flex gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{item.name}</div>
                    <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{item.note}</p>
                  </div>
                  <div className="shrink-0"><StatusPill status={item.status} /></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="foundations">
          <div>
            <h2 id="foundations" className="text-2xl font-semibold">Foundation audit</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Current visual values are shown for inspection, not approved as the final RD-P01 token system.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Specimen title="Semantic colour tokens" description="Tokens already defined in globals.css; primitive hard-coded colours remain a consolidation finding.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {tokenSamples.map((token) => (
                  <div key={token.name} className="space-y-2">
                    <div className={`h-14 rounded-xl ${token.className}`} />
                    <div className="text-sm font-medium">{token.name}</div>
                    <code className="text-xs text-zinc-500">{token.value}</code>
                  </div>
                ))}
              </div>
            </Specimen>

            <Specimen title="Typography" description="Current type hierarchy for visual baseline review.">
              <div className="space-y-4">
                <div><div className="text-xs text-zinc-500">Page title</div><div className="text-4xl font-bold tracking-tight">Clean, clear hierarchy</div></div>
                <div><div className="text-xs text-zinc-500">Section title</div><div className="text-2xl font-semibold">Reusable section heading</div></div>
                <div><div className="text-xs text-zinc-500">Card title</div><div className="text-lg font-semibold">Reusable card heading</div></div>
                <div><div className="text-xs text-zinc-500">Body</div><p className="text-base leading-7">Body copy should remain readable across public, booking, account and Office surfaces.</p></div>
                <div><div className="text-xs text-zinc-500">Caption / helper</div><p className="text-sm text-zinc-500">Secondary information and field guidance.</p></div>
              </div>
            </Specimen>

            <Specimen title="Spacing, radius and elevation" description="Existing Tailwind values are visualised only; a canonical scale is still planned.">
              <div className="space-y-5">
                <div className="flex flex-wrap items-end gap-4">
                  {spacingSamples.map((sample) => <div key={sample.label} className="text-center"><div className={`bg-zinc-200 ${sample.className} dark:bg-zinc-800`}><div className="h-6 w-10 bg-primary" /></div><div className="mt-1 text-xs">{sample.label}</div></div>)}
                </div>
                <div className="grid grid-cols-3 gap-3"><div className="h-16 rounded-md border bg-white" /><div className="h-16 rounded-xl border bg-white" /><div className="h-16 rounded-2xl border bg-white" /></div>
                <div className="grid grid-cols-3 gap-3"><div className="h-16 rounded-xl border bg-white shadow-sm" /><div className="h-16 rounded-xl border bg-white shadow-md" /><div className="h-16 rounded-xl border bg-white shadow-xl" /></div>
              </div>
            </Specimen>

            <Specimen title="Container & responsive reference" description="Baseline width and breakpoint references; final responsive rules belong to the approved design system.">
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border p-3"><strong>Section:</strong> max-width ≈ 1100px with responsive horizontal padding.</div>
                <div className="rounded-lg border p-3"><strong>Showcase:</strong> max-width 7xl.</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-zinc-100 p-3">Base<br />mobile</div><div className="rounded-lg bg-zinc-100 p-3">sm<br />640+</div><div className="rounded-lg bg-zinc-100 p-3">md<br />768+</div><div className="rounded-lg bg-zinc-100 p-3">lg<br />1024+</div></div>
              </div>
            </Specimen>
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="existing-primitives">
          <div>
            <h2 id="existing-primitives" className="text-2xl font-semibold">Existing primitives</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Safe presentation specimens for the reusable UI files confirmed during RD-P00V. Specialised CTAButton is classified above rather than activated here because it carries booking/marketing tracking behaviour.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Specimen title="Button" description="Current variants, sizes and disabled state.">
              <div className="flex flex-wrap gap-3"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button><Button disabled>Disabled</Button></div>
              <div className="mt-4 flex flex-wrap items-center gap-3"><Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button><Button size="xl">Extra large</Button></div>
            </Specimen>

            <Specimen title="Badge" description="Generic labels only. Domain status semantics belong in planned StatusBadge.">
              <div className="flex flex-wrap gap-3"><Badge>Default</Badge><Badge variant="success">Success</Badge><Badge variant="warning">Warning</Badge><Badge variant="destructive">Destructive</Badge><Badge variant="outline">Outline</Badge></div>
            </Specimen>

            <Specimen title="Input + Label" description="Normal, search, disabled, helper, required and invalid states.">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="ui-name">Customer name</Label><Input id="ui-name" placeholder="Bronte Davies" /><p className="text-xs text-zinc-500">Helper text example.</p></div>
                <div className="space-y-2"><Label htmlFor="ui-search">Search</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input id="ui-search" className="pl-9" placeholder="Bookings, customers, cleaners…" /></div></div>
                <div className="space-y-2"><Label htmlFor="ui-disabled">Disabled</Label><Input id="ui-disabled" disabled value="Read only example" /></div>
                <div className="space-y-2"><Label htmlFor="ui-error">Email <span aria-hidden>*</span></Label><Input id="ui-error" type="email" aria-invalid="true" aria-describedby="ui-error-message" className="border-red-500 focus-visible:outline-red-600" defaultValue="not-an-email" /><p id="ui-error-message" className="text-xs font-medium text-red-600">Enter a valid email address.</p></div>
              </div>
            </Specimen>

            <Specimen title="Card" description="Composable surface. Example actions are deliberately disabled so this baseline cannot trigger business behaviour.">
              <Card><CardHeader><CardTitle>Standard cleaning</CardTitle><CardDescription>Presentation specimen only.</CardDescription></CardHeader><CardContent><div className="text-3xl font-bold">R635</div><p className="mt-1 text-sm text-zinc-600">Example value only.</p></CardContent><CardFooter className="gap-2"><Button size="sm" disabled>Example book action</Button><Button size="sm" variant="outline" disabled>Example details action</Button></CardFooter></Card>
            </Specimen>

            <Specimen title="Avatar" description="Identity presentation with fallback initials."><div className="flex items-center gap-4"><Avatar className="h-12 w-12"><AvatarFallback>SF</AvatarFallback></Avatar><div><div className="font-semibold">Shalean user</div><div className="text-sm text-zinc-500">Fallback avatar state</div></div></div></Specimen>

            <Specimen title="DropdownMenu" description="Local interaction only; menu items do not call APIs."><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal className="h-4 w-4" /> Example actions</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>Presentation actions</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem>View example</DropdownMenuItem><DropdownMenuItem>Second example</DropdownMenuItem></DropdownMenuContent></DropdownMenu></Specimen>

            <Specimen title="Dialog" description="Cancel now uses DialogClose; Continue is disabled because this is presentation only."><Dialog><DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Example confirmation</DialogTitle><DialogDescription>No booking, payment or data action is performed.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled>Continue example</Button></DialogFooter></DialogContent></Dialog></Specimen>

            <Specimen title="Accordion" description="Disclosure pattern for secondary information."><Accordion type="single" collapsible className="w-full"><AccordionItem value="one"><AccordionTrigger>What is this catalogue?</AccordionTrigger><AccordionContent>A development-only visual audit of reusable presentation components.</AccordionContent></AccordionItem><AccordionItem value="two"><AccordionTrigger>Does it change business logic?</AccordionTrigger><AccordionContent>No. Platform business logic remains authoritative and unchanged.</AccordionContent></AccordionItem></Accordion></Specimen>

            <Specimen title="Command" description="Existing cmdk search/list primitive."><div className="overflow-hidden rounded-xl border"><Command><CommandInput placeholder="Search UI patterns…" /><CommandList><CommandEmpty>No pattern found.</CommandEmpty><CommandGroup heading="Examples"><CommandItem value="booking">Booking summary</CommandItem><CommandItem value="customer">Customer identity</CommandItem><CommandItem value="office">Office shell</CommandItem></CommandGroup></CommandList></Command></div></Specimen>

            <Specimen title="FloatingSelect" description="Existing interactive custom-select primitive; changes local showcase state only."><FloatingSelect label="Example service" value={selectValue} onChange={setSelectValue} options={[{ value: "standard", label: "Standard cleaning" }, { value: "deep", label: "Deep cleaning" }, { value: "move", label: "Move cleaning" }]} /></Specimen>

            <Specimen title="Section" description="Existing marketing/hub layout primitive; shown as a bounded structural specimen."><div className="overflow-hidden rounded-xl border bg-zinc-100"><Section spacing="tight" className="!px-4 !py-6"><div className="rounded-lg border border-dashed border-zinc-400 bg-white p-4 text-sm">Section content area — shared width and responsive padding primitive.</div></Section></div></Specimen>
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="planned-system">
          <div><h2 id="planned-system" className="text-2xl font-semibold">Planned global system</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Names are aligned with the Shalean Global Reusable UI System inventory. These are not implemented merely because they appear here.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plannedGroups.map((group) => <Card key={group.title}><CardHeader><CardTitle className="text-base">{group.title}</CardTitle><CardDescription>Planned / consolidate</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">{group.items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden>•</span><span>{item}</span></li>)}</ul></CardContent></Card>)}</div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="text-lg font-semibold">RD-P00 approval gate</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">This catalogue is an audit artefact, not RD-P01 implementation. Hard-coded primitive colours, duplicate CTA/select systems and missing global patterns are recorded findings. Do not redesign or replace them until RD-P00 is approved. No backend, booking, payment, RBAC or persistence behaviour is changed by this page.</p>
        </section>
      </div>
    </main>
  );
}
