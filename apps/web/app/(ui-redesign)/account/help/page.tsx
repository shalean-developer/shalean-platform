"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FaqCategory = {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  title: string;
  items: { q: string; a: string }[];
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "bookings",
    icon: BookOpen,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
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
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
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
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
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
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
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
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-gray-900"
        onClick={() => setOpen((o) => !o)}
      >
        {q}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>
      {open ? <p className="pb-4 text-sm leading-relaxed text-gray-500">{a}</p> : null}
    </div>
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

  const displayed = activeCategory
    ? filtered.filter((c) => c.id === activeCategory)
    : filtered;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-gray-500">
          Find answers, browse FAQs, or reach our team directly.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveCategory(null); }}
          placeholder="Search for help…"
          className="h-12 rounded-2xl border-gray-200 pl-12 text-sm shadow-sm focus-visible:ring-blue-500"
        />
      </div>

      {/* Emergency CTA */}
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600">
            <AlertTriangle className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-red-900">Urgent booking issue?</p>
            <p className="mt-1 text-sm text-red-700">
              If your cleaner hasn&apos;t arrived or there&apos;s an emergency, contact us immediately on WhatsApp.
            </p>
          </div>
          <a
            href="https://wa.me/27825915525?text=URGENT%3A%20I%20need%20help%20with%20my%20booking"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            Get help now
          </a>
        </div>
      </div>

      {/* Contact options */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Contact us</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <a
            href="https://wa.me/27825915525"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-2xl border border-green-100 bg-green-50 p-5 shadow-sm transition hover:border-green-200 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-600 shadow-sm">
              <MessageCircle className="h-6 w-6 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">WhatsApp</p>
              <p className="text-sm text-green-700 font-medium">082 591 5525</p>
              <p className="text-xs text-gray-500">Fastest response</p>
            </div>
          </a>
          <a
            href="mailto:hello@shalean.co.za"
            className="group flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <Mail className="h-6 w-6 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Email</p>
              <p className="text-sm text-blue-700 font-medium">hello@shalean.co.za</p>
              <p className="text-xs text-gray-500">Reply within 24 hours</p>
            </div>
          </a>
          <a
            href="tel:+27825915525"
            className="group flex items-center gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-sm">
              <Phone className="h-6 w-6 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Call us</p>
              <p className="text-sm text-violet-700 font-medium">082 591 5525</p>
              <p className="text-xs text-gray-500">Mon–Sat 8am–6pm</p>
            </div>
          </a>
        </div>
      </section>

      {/* FAQ categories filter */}
      {!search.trim() ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
              activeCategory === null
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                activeCategory === cat.id
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>
      ) : null}

      {/* FAQ accordion */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {search.trim() ? `Results for "${search}"` : "Frequently asked questions"}
        </h2>
        {displayed.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 mx-auto">
              <Search className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="mt-4 font-semibold text-gray-900">No results found</p>
            <p className="mt-1 text-sm text-gray-500">
              Try different keywords or contact us directly on WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayed.map((cat) => (
              <div key={cat.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${cat.iconBg}`}>
                    <cat.icon className={`h-4 w-4 ${cat.iconColor}`} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{cat.title}</h3>
                </div>
                <div className="px-5">
                  {cat.items.map((item) => (
                    <FaqItem key={item.q} q={item.q} a={item.a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Book a clean CTA */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 mx-auto shadow-sm">
          <Sparkles className="h-7 w-7 text-white" strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Ready to book a clean?</h2>
        <p className="mt-1 text-sm text-gray-500">Schedule your next visit in just a few taps.</p>
        <Button asChild size="lg" className="mt-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
          <Link href="/account/book">Book a clean</Link>
        </Button>
      </div>
    </div>
  );
}
