"use client";

import { MoreHorizontal, Search, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const plannedGroups = [
  { title: "Foundations", items: ["Colour tokens", "Typography scale", "Spacing scale", "Radius scale", "Shadow scale", "Container widths", "Breakpoints", "Z-index layers"] },
  { title: "Navigation & layout", items: ["PageHeader", "Section", "PublicHeader", "OfficeShell", "AccountShell", "Tabs", "Breadcrumbs"] },
  { title: "Data & feedback", items: ["DataTable", "Pagination", "FilterBar", "StatusBadge", "EmptyState", "Skeleton", "Toast", "Alert"] },
  { title: "Domain patterns", items: ["BookingSummary", "PaymentSummary", "CustomerIdentity", "CleanerIdentity", "MetricCard", "ScheduleCalendar"] },
];

function Specimen({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
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

export function UISystemShowcase() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>RD-P01</Badge>
            <Badge variant="outline">Development only</Badge>
            <Badge variant="success">Existing primitives</Badge>
          </div>
          <div className="max-w-3xl space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Shalean reusable UI system</h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Visual source of truth for reusable components on the design/rd04-platform-redesign branch. This page demonstrates presentation only and does not change booking, payment, RBAC or data behavior.
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Core primitives</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Current components from apps/web/components/ui rendered in one place.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Specimen title="Buttons" description="Canonical button variants and sizes currently available.">
              <div className="flex flex-wrap gap-3">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="xl">Extra large</Button>
              </div>
            </Specimen>

            <Specimen title="Badges" description="Shared compact status and category labels.">
              <div className="flex flex-wrap gap-3">
                <Badge>Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </Specimen>

            <Specimen title="Form controls" description="Input and label baseline including disabled and error-like presentation examples.">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ui-name">Customer name</Label>
                  <Input id="ui-name" placeholder="Bronte Davies" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-search">Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input id="ui-search" className="pl-9" placeholder="Bookings, customers, cleaners…" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-disabled">Disabled</Label>
                  <Input id="ui-disabled" disabled value="Read only example" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-email">Email</Label>
                  <Input id="ui-email" type="email" placeholder="customer@example.com" />
                </div>
              </div>
            </Specimen>

            <Specimen title="Cards" description="Composable surface with header, body and footer regions.">
              <Card>
                <CardHeader>
                  <CardTitle>Standard cleaning</CardTitle>
                  <CardDescription>Example reusable service or summary card.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">R635</div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Example presentation only.</p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm">Book</Button>
                  <Button size="sm" variant="outline">Details</Button>
                </CardFooter>
              </Card>
            </Specimen>

            <Specimen title="Avatar" description="Identity presentation with fallback initials.">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12"><AvatarFallback>SF</AvatarFallback></Avatar>
                <div>
                  <div className="font-semibold">Shalean user</div>
                  <div className="text-sm text-zinc-500">Fallback avatar state</div>
                </div>
              </div>
            </Specimen>

            <Specimen title="Dropdown menu" description="Reusable action-menu pattern for rows, cards and headers.">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline"><MoreHorizontal className="h-4 w-4" /> Actions</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Booking actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>View details</DropdownMenuItem>
                  <DropdownMenuItem>Reschedule</DropdownMenuItem>
                  <DropdownMenuItem>Contact customer</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Specimen>

            <Specimen title="Dialog" description="Modal/dialog baseline for confirmations and focused tasks.">
              <Dialog>
                <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Example confirmation</DialogTitle>
                    <DialogDescription>This is a visual specimen. No booking or payment action is performed.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button>Continue</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Specimen>

            <Specimen title="Accordion" description="Disclosure pattern for secondary information and FAQs.">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="products">
                  <AccordionTrigger>Who provides cleaning products?</AccordionTrigger>
                  <AccordionContent>Policy text should remain authoritative elsewhere; this is only a component demonstration.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="arrival">
                  <AccordionTrigger>How does the arrival window display?</AccordionTrigger>
                  <AccordionContent>The final booking flow will compose shared scheduling components around the platform's canonical data.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </Specimen>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-200"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h2 className="text-2xl font-semibold">Planned global system</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Items from the Shalean Global Reusable UI System inventory that will be implemented or consolidated in controlled slices.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plannedGroups.map((group) => (
              <Card key={group.title}>
                <CardHeader>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <CardDescription>Planned / consolidate</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {group.items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden>•</span><span>{item}</span></li>)}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">RD-P01 rule</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Before creating a page-specific UI element, first check whether the element belongs in this reusable system. Existing platform APIs, RBAC, booking, pricing, payment, ownership and persistence logic remain authoritative.
          </p>
        </section>
      </div>
    </main>
  );
}
