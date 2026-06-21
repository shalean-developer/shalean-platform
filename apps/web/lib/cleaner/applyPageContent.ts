import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarClock,
  Home,
  Smartphone,
  Sparkles,
  Star,
  Building2,
  BedDouble,
} from "lucide-react";

export const CLEANER_APPLY_FORM_PATH = "/cleaner/apply/form";

export const CLEANER_APPLY_WHY_JOIN: ReadonlyArray<{ Icon: LucideIcon; text: string }> = [
  { Icon: CalendarClock, text: "Choose when and where you work" },
  { Icon: Banknote, text: "Weekly payouts for completed jobs" },
  { Icon: Smartphone, text: "Cleaner app for job offers on your phone" },
  { Icon: Star, text: "Fair pay — earn more as you build experience" },
];

export const CLEANER_APPLY_STATS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Since 2022", label: "Serving Cape Town homes" },
  { value: "4,500+", label: "Cleans completed" },
  { value: "100+", label: "5-star customer reviews" },
];

export const CLEANER_APPLY_WORK_TYPES: ReadonlyArray<{
  Icon: LucideIcon;
  title: string;
  desc: string;
  tasks: readonly string[];
}> = [
  {
    Icon: Home,
    title: "Home cleaning",
    desc: "Regular upkeep for apartments and houses across Cape Town.",
    tasks: ["Standard cleaning", "Deep cleaning", "Kitchen & bathrooms", "Bedrooms & living areas"],
  },
  {
    Icon: BedDouble,
    title: "Airbnb & turnover",
    desc: "Fast, guest-ready cleans between check-ins.",
    tasks: ["Linen changes", "Sanitising", "Restocking essentials", "Quick turnarounds"],
  },
  {
    Icon: Building2,
    title: "Office cleaning",
    desc: "Small offices, studios, and client-facing workspaces.",
    tasks: ["Desks & common areas", "Kitchens & bathrooms", "After-hours slots", "Recurring visits"],
  },
  {
    Icon: Sparkles,
    title: "Move-out & extras",
    desc: "Deep jobs and add-ons when clients need more.",
    tasks: ["Move-in / move-out", "Inside oven & fridge", "Laundry & ironing", "Inside windows"],
  },
];

export const CLEANER_APPLY_REQUIREMENTS: readonly string[] = [
  "A smartphone with WhatsApp so we can reach you quickly",
  "Basic English to communicate with clients and our team",
  "A clean criminal record (we verify during onboarding)",
  "Reliable transport to jobs in your chosen areas",
  "If you are not a South African: a work permit, refugee ID (legal document that allows you to work in South Africa), or residency",
  "Complete the online application form — we review every submission online",
];

export const CLEANER_APPLY_TESTIMONIALS: ReadonlyArray<{ quote: string; name: string; area: string }> = [
  {
    quote:
      "I can pick jobs near my home and get paid every week. The app makes it easy to see what's available.",
    name: "Thandi",
    area: "Cape Town",
  },
  {
    quote:
      "Shalean helped me grow my confidence — every client teaches me something new and the team supports you.",
    name: "Yvonne",
    area: "Southern suburbs",
  },
  {
    quote:
      "Flexible hours mean I can work around my family. Applying was simple and they contacted me on WhatsApp.",
    name: "Mary",
    area: "Atlantic Seaboard",
  },
];
