"use client";

import Link from "next/link";
import { useId, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FaqCategory = {
  id: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  iconTone: string;
  title: string;
  items: { q: string; a: string }[];
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "bookings",
    icon: BookOpen,
    iconTone: "bg-primary/10 text-primary",
    title: "Bookings & scheduling",
    items: [
      {
        q: "How do I reschedule a booking?",
        a: "Go to My Bookings, open the booking you'd like to reschedule, and click 'Reschedule'. You can choose a new date and time within the same billing month.",
      },
      {
        q: "Can I cancel a booking?",
        a: "Yes — open the booking details and select 'Cancel booking'. Cancellations made within 24 hours of the visit may be subject to a late cancellation fee.",
      },
      {
        q: "What happens if my cleaner is running late?",
        a: "We'll notify you by WhatsApp. If your cleaner is more than 30 minutes late without notification, please contact our support team immediately.",
      },
      {
        q: "How far in advance do I need to book?",
        a: "We recommend booking at least 48 hours in advance to secure your preferred time slot. Same-day bookings are subject to cleaner availability.",
      },
    ],
  },
  {
    id: "billing",
    icon: CreditCard,
    iconTone: "bg-warning/15 text-warning-foreground",
    title: "Billing & payments",
    items: [
      {
        q: "How does monthly billing work?",
        a: "All your visits in a calendar month are grouped into a single monthly invoice. You'll receive this towards the end of the month with a payment link.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept card payments, EFT, and mobile payments via Paystack. All transactions are encrypted and secure.",
      },
      {
        q: "What if I see a charge I don't recognise?",
        a: "Contact us immediately on WhatsApp with your booking reference number. We investigate all disputes within 24 hours.",
      },
      {
        q: "Can I get a refund?",
        a: "If you're not satisfied with a clean, contact us within 48 hours and we'll either send a re-clean or issue a partial refund at our discretion.",
      },
    ],
  },
  {
    id: "cleaners",
    icon: Users,
    iconTone: "bg-success/10 text-success",
    title: "Cleaners & quality",
    items: [
      {
        q: "Are your cleaners background checked?",
        a: "Yes — every Shalean cleaner goes through a rigorous vetting process including ID verification, reference checks, and a skills assessment.",
      },
      {
        q: "Can I request the same cleaner every time?",
        a: "Yes! For recurring plans, we try to send the same cleaner each visit. You can also request a specific cleaner when booking.",
      },
      {
        q: "What if I'm not happy with my cleaner?",
        a: "Leave a review after your visit and contact us on WhatsApp. We'll arrange a different cleaner for your next booking.",
      },
      {
        q: "What do your cleaners bring?",
        a: "Our cleaners bring all necessary cleaning equipment and eco-friendly products. If you have preferred products, just let us know.",
      },
    ],
  },
  {
    id: "general",
    icon: HelpCircle,
    iconTone: "bg-accent text-accent-foreground",
    title: "General questions",
    items: [
      {
        q: "What areas do you service?",
        a: "We currently serve Cape Town and surrounding suburbs. Type your address in the booking form to check if we cover your area.",
      },
      {
        q: "How do I update my address?",
        a: "Go to Properties in your account menu. You can add, edit, and set a primary address there.",
      },
      {
        q: "How do I change my email or password?",
        a: "Visit Profile Settings in your account. You can update your name, phone, WhatsApp number, and password there.",
      },
      {
        q: "How do referrals work?",
        a: "Share your referral code from the Referrals page. When a friend books their first clean, you both earn a discount on future cleans.",
      },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>
      {open ? (
        <p id={panelId} className="pb-4 text-sm leading-relaxed text-muted-foreground">
          {a}
        </p>
      ) : null}
    </div>
  );
}

function ContactOption({
  href,
  title,
  value,
  detail,
  icon: Icon,
  iconTone,
  external = false,
}: {
  href: string;
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  iconTone: string;
  external?: boolean;
}) {
  return (
    <Card className="min-w-0 overflow-hidden transition-shadow hover:shadow-[var(--ui-shadow-md)]">
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="flex h-full items-center gap-4 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", iconTone)}>
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="break-all text-sm font-medium text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </a>
    </Card>
  );
}

export default function AccountHelpPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = FAQ_CATEGORIES.map((cat) => ({
    ...cat,
    items: search.trim()
      ? cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(search.toLowerCase()) ||
            item.a.toLowerCase().includes(search.toLowerCase()),
        )
      : cat.items,
  })).filter((cat) => cat.items.length > 0);

  const displayed = activeCategory ? filtered.filter((category) => category.id === activeCategory) : filtered;

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find answers, browse FAQs, or reach our team directly.
        </p>
      </header>

      <div className="relative">
        <label htmlFor="account-help-search" className="sr-only">Search help</label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="account-help-search"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveCategory(null);
          }}
          placeholder="Search for help…"
          className="h-12 pl-12"
        />
      </div>

      <Card className="border-destructive/25 bg-destructive/5">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Urgent booking issue?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If your cleaner hasn&apos;t arrived or there&apos;s an emergency, contact us immediately on WhatsApp.
              </p>
            </div>
            <Button asChild variant="destructive" className="w-full shrink-0 sm:w-auto">
              <a
                href="https://wa.me/27825915525?text=URGENT%3A%20I%20need%20help%20with%20my%20booking"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get help now
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="contact-us-heading">
        <h2 id="contact-us-heading" className="mb-4 text-base font-semibold text-foreground">Contact us</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ContactOption
            href="https://wa.me/27825915525"
            title="WhatsApp"
            value="082 591 5525"
            detail="Fastest response"
            icon={MessageCircle}
            iconTone="bg-success/10 text-success"
            external
          />
          <ContactOption
            href="mailto:hello@shalean.co.za"
            title="Email"
            value="hello@shalean.co.za"
            detail="Reply within 24 hours"
            icon={Mail}
            iconTone="bg-primary/10 text-primary"
          />
          <ContactOption
            href="tel:+27825915525"
            title="Call us"
            value="082 591 5525"
            detail="Mon–Sat 8am–6pm"
            icon={Phone}
            iconTone="bg-accent text-accent-foreground"
          />
        </div>
      </section>

      {!search.trim() ? (
        <div className="flex flex-wrap gap-2" aria-label="FAQ categories">
          <Button
            type="button"
            size="sm"
            variant={activeCategory === null ? "default" : "outline"}
            onClick={() => setActiveCategory(null)}
            aria-pressed={activeCategory === null}
          >
            All
          </Button>
          {FAQ_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <Button
                key={cat.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setActiveCategory(active ? null : cat.id)}
                aria-pressed={active}
              >
                {cat.title}
              </Button>
            );
          })}
        </div>
      ) : null}

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="mb-4 text-base font-semibold text-foreground">
          {search.trim() ? `Results for "${search}"` : "Frequently asked questions"}
        </h2>
        {displayed.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Search className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="mt-4 font-semibold text-foreground">No results found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try different keywords or contact us directly on WhatsApp.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayed.map((cat) => (
              <Card key={cat.id} className="overflow-hidden">
                <CardHeader className="border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", cat.iconTone)}>
                      <cat.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </div>
                    <CardTitle className="text-base">{cat.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 py-0">
                  {cat.items.map((item) => (
                    <FaqItem key={item.q} q={item.q} a={item.a} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Ready to book a clean?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Schedule your next visit in just a few taps.</p>
          <Button asChild size="lg" className="mt-4">
            <Link href="/account/book">Book a clean</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
