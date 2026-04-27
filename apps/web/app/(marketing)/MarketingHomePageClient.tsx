"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Bath,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sofa,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
  Wind,
  Zap,
} from "lucide-react";
import { AddOnsSelector, iconForAddOn, type AddOn } from "@/components/booking/AddOnsSelector";
import { AvailabilityMessage } from "@/components/booking/AvailabilityMessage";
import { inferServiceTypeFromServiceId, type BookingServiceId } from "@/components/booking/serviceCategories";
import { BOOKING_NODRAFT_QUERY, bookingFlowHref } from "@/lib/booking/bookingFlow";
import { BOOKING_DATA_STORAGE_KEY } from "@/lib/booking/bookingWidgetDraft";
import { todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { cn } from "@/lib/utils";
import { trackGrowthEvent, withHomepageContext } from "@/lib/growth/trackEvent";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { calculateBookingPrice } from "@/lib/pricing/calculateBookingPrice";
import { filterExtrasForSnapshot, isExtraAllowedInSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";

const bookingHref = bookingFlowHref("entry");
const bookingHrefNoDraft = bookingFlowHref("entry", { [BOOKING_NODRAFT_QUERY]: "true" });
const whatsappUrl = CUSTOMER_SUPPORT_WHATSAPP_URL;

type ServiceCard = {
  id: string;
  bookingServiceId: BookingServiceId;
  icon: ElementType;
  title: string;
  description: string;
  from: number;
  highlight: boolean;
  /** When true, show “High demand” instead of the default save signal (offers only). */
  marketingHighDemand?: boolean;
};

const services: ServiceCard[] = [
  {
    id: "standard",
    bookingServiceId: "standard",
    icon: Home,
    title: "Standard Cleaning",
    description: "Regular upkeep for busy households. Floors, kitchen, bathrooms, bedrooms — all refreshed.",
    from: 350,
    highlight: true,
  },
  {
    id: "deep",
    bookingServiceId: "deep",
    icon: Sparkles,
    title: "Deep Cleaning",
    description: "Top-to-bottom, inside-out. Every corner, surface, and appliance treated with precision.",
    from: 650,
    highlight: false,
  },
  {
    id: "airbnb",
    bookingServiceId: "airbnb",
    icon: RefreshCw,
    title: "Airbnb Turnover",
    description: "Fast, guest-ready results between check-ins. Linen changes, sanitisation, restocking.",
    from: 450,
    highlight: false,
  },
  {
    id: "moveout",
    bookingServiceId: "move",
    icon: Wind,
    title: "Move-Out Clean",
    description: "Leave your property spotless. Ideal for tenants, landlords, and property handovers.",
    from: 750,
    highlight: false,
  },
  {
    id: "carpet",
    bookingServiceId: "carpet",
    icon: Sofa,
    title: "Carpet Cleaning",
    description: "Steam-clean carpets and rugs to remove stains, allergens, and odours effectively.",
    from: 400,
    highlight: false,
  },
  {
    id: "bathroom",
    bookingServiceId: "deep",
    icon: Bath,
    title: "Bathroom Deep Clean",
    description: "Grout, tiles, fixtures — full sanitisation of your bathrooms for a hotel-level finish.",
    from: 250,
    highlight: false,
  },
];

type PricingTier = {
  id: string;
  bookingServiceId: BookingServiceId;
  name: string;
  from: number;
  bullets: string[];
  accent: boolean;
};

const pricingTiers: PricingTier[] = [
  {
    id: "standard",
    bookingServiceId: "standard",
    name: "Standard Cleaning",
    from: 350,
    bullets: ["Dusting & vacuuming", "Kitchen wipe-down", "Bathroom sanitise", "Floor mop & polish"],
    accent: false,
  },
  {
    id: "deep",
    bookingServiceId: "deep",
    name: "Deep Cleaning",
    from: 650,
    bullets: ["Everything in Standard", "Inside oven & fridge", "Interior windows", "Restock essentials"],
    accent: true,
  },
  {
    id: "airbnb",
    bookingServiceId: "airbnb",
    name: "Airbnb Turnover",
    from: 450,
    bullets: ["Linen & towel change", "Full bathroom reset", "Kitchen clean-down", "Restock essentials"],
    accent: false,
  },
];

type WhyItem = {
  icon: ElementType;
  title: string;
  body: string;
};

const whyItems: WhyItem[] = [
  {
    icon: ShieldCheck,
    title: "Vetted & insured cleaners",
    body: "Every cleaner is background-checked, identity-verified, and trained before their first job.",
  },
  {
    icon: Clock,
    title: "Show up on time, every time",
    body: "Punctuality is tracked. If a cleaner is late, we notify you and re-schedule at no extra cost.",
  },
  {
    icon: CreditCard,
    title: "Transparent pricing",
    body: "Your full price is shown before you pay. No hidden fees, no surprise charges on the day.",
  },
  {
    icon: Zap,
    title: "Instant online booking",
    body: "Pick your service, rooms, date, and slot in under 2 minutes. No phone calls needed.",
  },
  {
    icon: ThumbsUp,
    title: "Satisfaction guarantee",
    body: "Not happy? Tell us within 24 hours and we'll send a cleaner back — free of charge.",
  },
  {
    icon: Phone,
    title: "Real support, fast replies",
    body: "Chat, call, or WhatsApp. Our Cape Town support team responds within minutes.",
  },
];

const steps = [
  { num: "01", title: "Enter your details", body: "Choose your home size, service type, and any extras." },
  { num: "02", title: "Get instant price", body: "Your exact quote is shown upfront — no guessing." },
  { num: "03", title: "Pick a time slot", body: "Choose a date and time that works for you, including same-day." },
  { num: "04", title: "Enjoy a spotless home", body: "A vetted cleaner arrives and handles the rest." },
];

const locations = [
  "Cape Town",
  "Sea Point",
  "Claremont",
  "Gardens",
  "Table View",
  "Durbanville",
  "Bellville",
  "Green Point",
  "Woodstock",
  "Observatory",
  "Constantia",
  "Camps Bay",
];

type Review = {
  author: string;
  location: string;
  rating: number;
  text: string;
  featured: boolean;
};

const reviews: Review[] = [
  {
    author: "Nadia K.",
    location: "Sea Point",
    rating: 5,
    text: "The apartment felt completely reset after the standard clean. Booking took 2 minutes and the cleaner was early. This is the only service I use now.",
    featured: true,
  },
  {
    author: "James T.",
    location: "Claremont",
    rating: 5,
    text: "Reliable weekly cleaning with clear pricing and friendly cleaners. Always on time, always thorough.",
    featured: false,
  },
  {
    author: "Ayesha M.",
    location: "Gardens",
    rating: 5,
    text: "Great service for keeping our home tidy between busy work weeks. The bathrooms are always spotless.",
    featured: false,
  },
  {
    author: "Peter L.",
    location: "Green Point",
    rating: 5,
    text: "Good recurring cleaning. The home feels reset after every visit — 100% recommend for apartments.",
    featured: false,
  },
  {
    author: "Megan R.",
    location: "Durbanville",
    rating: 5,
    text: "Simple booking, fair pricing, and a neat standard clean every time. Satisfaction guaranteed is real.",
    featured: false,
  },
];

type FaqItem = {
  question: string;
  answer: string;
};

const faqs: FaqItem[] = [
  {
    question: "What is included in standard home cleaning?",
    answer:
      "Standard cleaning includes reachable dusting, vacuuming, floor mopping, kitchen wipe-downs, bathroom sanitisation, and general room refreshes across all selected bedrooms and living areas.",
  },
  {
    question: "How much is standard cleaning in Cape Town?",
    answer:
      "Standard cleaning starts from R350 for a 1-bedroom home. Prices depend on property size, number of bathrooms, and optional extras. Your exact quote is shown before checkout — no surprises.",
  },
  {
    question: "Can I book recurring standard cleaning?",
    answer:
      "Yes. Standard cleaning is designed for weekly, bi-weekly, and monthly maintenance. Recurring customers get priority slot access and can manage bookings from their dashboard.",
  },
  {
    question: "Do cleaners bring supplies?",
    answer:
      "Yes. All cleaners arrive with professional-grade supplies and equipment. If you prefer eco-friendly or specific products, you can request this when booking.",
  },
  {
    question: "Is same-day cleaning available?",
    answer:
      "Same-day slots are available depending on cleaner availability in your area. Book early in the morning for the best chance of securing a same-day slot in Cape Town.",
  },
];

const quoteServices: { id: BookingServiceId; label: string; highDemand?: boolean }[] = [
  { id: "standard", label: "Standard" },
  { id: "deep", label: "Deep Clean" },
  { id: "airbnb", label: "Airbnb" },
];

const URGENCY_ROTATING = [
  "Same-day slots filling fast",
  "Only a few cleaner slots left today",
  "Book early for your preferred time",
] as const;

function urgencyRotatingLine(): string {
  return URGENCY_ROTATING[new Date().getHours() % URGENCY_ROTATING.length] ?? URGENCY_ROTATING[0];
}

function homeWidgetServiceFromBookingId(service: BookingServiceId): HomeWidgetServiceKey {
  if (
    service === "standard" ||
    service === "airbnb" ||
    service === "deep" ||
    service === "move" ||
    service === "carpet"
  ) {
    return service;
  }
  return "standard";
}

function scrollToQuote() {
  document.getElementById("hero-quote")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function focusQuoteFirstField() {
  if (typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      (document.querySelector("[data-quote-first-input]") as HTMLElement | null)?.focus?.();
    });
  });
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function footerLinkHref(sectionTitle: string, linkLabel: string): string {
  if (sectionTitle === "Services") {
    if (linkLabel === "Standard Cleaning") return "/#hero-quote";
    if (linkLabel === "Deep Cleaning") return "/#hero-quote";
    if (linkLabel === "Airbnb Turnover") return "/#hero-quote";
    if (linkLabel === "Move-Out Clean") return bookingHref;
    if (linkLabel === "Carpet Cleaning") return bookingHref;
  }
  if (sectionTitle === "Areas") {
    const q = encodeURIComponent(`${linkLabel}, Cape Town, South Africa`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  if (sectionTitle === "Company") {
    if (linkLabel === "About") return "/#how-it-works";
    if (linkLabel === "FAQ") return "/#faq";
    if (linkLabel === "Contact") return whatsappUrl;
    if (linkLabel === "Privacy Policy") return "mailto:hello@shaleancleaning.com?subject=Privacy%20policy";
    if (linkLabel === "Terms") return "mailto:hello@shaleancleaning.com?subject=Terms%20of%20service";
  }
  return bookingHref;
}

function footerServiceBookingId(linkLabel: string): BookingServiceId | null {
  if (linkLabel === "Standard Cleaning") return "standard";
  if (linkLabel === "Deep Cleaning") return "deep";
  if (linkLabel === "Airbnb Turnover") return "airbnb";
  if (linkLabel === "Move-Out Clean") return "move";
  if (linkLabel === "Carpet Cleaning") return "carpet";
  return null;
}

type TrustCardData = {
  id: string;
  icon: ElementType;
  title: string;
  subtitle: string;
};

const trustCards: TrustCardData[] = [
  {
    id: "rating",
    icon: Star,
    title: "4.9 rating",
    subtitle: "From verified reviews",
  },
  {
    id: "homes",
    icon: Users,
    title: "Trusted by 500+ homes",
    subtitle: "Across Cape Town",
  },
  {
    id: "vetted",
    icon: ShieldCheck,
    title: "Vetted cleaners",
    subtitle: "ID & reference checked",
  },
  {
    id: "guarantee",
    icon: Sparkles,
    title: "Satisfaction guarantee",
    subtitle: "Support if something is missed",
  },
];

type TrustCardProps = {
  card: TrustCardData;
};

function TrustCard({ card }: TrustCardProps) {
  const Icon = card.icon;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
        <Icon className="h-5 w-5 text-blue-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-slate-800">{card.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{card.subtitle}</p>
      </div>
    </div>
  );
}

function TrustBar() {
  return (
    <section className="border-b border-slate-100 bg-white py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 text-center text-sm font-semibold text-slate-600">
          Trusted by homeowners, tenants, and Airbnb hosts across Cape Town
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustCards.map((card) => (
            <TrustCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function StandardCleaningPage() {
  const router = useRouter();
  const [selectedService, setSelectedService] = useState<BookingServiceId>("standard");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [extraRooms, setExtraRooms] = useState(0);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [continueLoading, setContinueLoading] = useState(false);
  const [quoteAck, setQuoteAck] = useState<string | null>(null);
  const [quoteHighlight, setQuoteHighlight] = useState(false);
  const [quoteStep, setQuoteStep] = useState<1 | 2 | 3>(1);
  const quoteAckTimers = useRef<{ clearAck?: number; clearRing?: number }>({});
  const homepageEnteredAtRef = useRef(Date.now());
  const pricingLoadedTrackedRef = useRef(false);
  const userContinuedToBookingRef = useRef(false);
  const abandonTrackedRef = useRef(false);
  const abandonSnapshotRef = useRef<{ service: BookingServiceId; extrasCount: number }>({
    service: "standard",
    extrasCount: 0,
  });
  const scrollDepthSentRef = useRef<Set<number>>(new Set());
  const { snapshot, extrasMeta, loading: pricingLoading } = usePricingCatalogSnapshot();
  const catalogReady = Boolean(snapshot) && !pricingLoading;

  useEffect(() => {
    abandonSnapshotRef.current = { service: selectedService, extrasCount: selectedExtras.length };
  }, [selectedExtras.length, selectedService]);

  useEffect(() => {
    if (!catalogReady || pricingLoadedTrackedRef.current) return;
    pricingLoadedTrackedRef.current = true;
    const loadTimeMs = Math.max(0, Date.now() - homepageEnteredAtRef.current);
    trackGrowthEvent("pricing_loaded", withHomepageContext({ loadTimeMs }));
  }, [catalogReady]);

  useEffect(() => {
    const fireAbandon = () => {
      if (userContinuedToBookingRef.current || abandonTrackedRef.current) return;
      abandonTrackedRef.current = true;
      const { service, extrasCount } = abandonSnapshotRef.current;
      trackGrowthEvent(
        "homepage_abandon",
        withHomepageContext({ step: "quote_widget", service, extrasCount }),
      );
    };
    const onPageHide = () => fireAbandon();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") fireAbandon();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const milestones = [25, 50, 75, 100];
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const el = document.documentElement;
        const maxScroll = el.scrollHeight - el.clientHeight;
        const pct = maxScroll <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / maxScroll) * 100));
        for (const depth of milestones) {
          if (pct >= depth && !scrollDepthSentRef.current.has(depth)) {
            scrollDepthSentRef.current.add(depth);
            trackGrowthEvent("homepage_scroll", withHomepageContext({ depth }));
          }
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const addOns = useMemo<AddOn[]>(
    () =>
      extrasMeta
        .filter((extra) => (snapshot ? isExtraAllowedInSnapshot(snapshot, extra.slug, selectedService) : false))
        .map((extra) => ({
          id: extra.slug,
          label: extra.name ?? extra.slug,
          price: Math.round(Number(extra.price) || 0),
          icon: iconForAddOn(extra.slug),
        })),
    [extrasMeta, selectedService, snapshot],
  );

  const handleServiceSelect = useCallback(
    (service: BookingServiceId) => {
      setSelectedService(service);
      if (snapshot) {
        setSelectedExtras((prev) => filterExtrasForSnapshot(snapshot, prev, service));
      }
    },
    [snapshot],
  );

  const selectQuoteWidgetService = useCallback(
    (id: BookingServiceId) => {
      trackGrowthEvent("homepage_service_select", withHomepageContext({ source: "quote_widget", service: id }));
      handleServiceSelect(id);
    },
    [handleServiceSelect],
  );

  const handleToggle = (id: string) => {
    setSelectedExtras((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const computeCatalogQuoteZarForService = useCallback(
    (serviceId: BookingServiceId): number | null => {
      if (!snapshot) return null;
      const allowedExtras = filterExtrasForSnapshot(snapshot, selectedExtras, serviceId);
      const serviceType = inferServiceTypeFromServiceId(serviceId) ?? serviceId;
      const result = calculateBookingPrice(
        {
          serviceType,
          service: serviceId,
          bedrooms,
          bathrooms,
          extraRooms,
          extras: allowedExtras,
        },
        snapshot,
      );
      return result?.totalPrice ?? null;
    },
    [bathrooms, bedrooms, extraRooms, selectedExtras, snapshot],
  );

  /** Catalog-backed only — never a formula fallback (avoids trust-killing price flash). */
  const catalogQuoteZar = useMemo(
    () => computeCatalogQuoteZarForService(selectedService),
    [computeCatalogQuoteZarForService, selectedService],
  );

  const isQuoteFormValid =
    selectedService != null && bedrooms > 0 && bathrooms > 0;
  const canContinueBooking = isQuoteFormValid && catalogReady && !continueLoading;
  const canGoToExtras = isQuoteFormValid;
  const canGoToReview = isQuoteFormValid && catalogReady;

  const goQuoteNext = useCallback(() => {
    setQuoteStep((s) => {
      if (s >= 3) return 3;
      return (s + 1) as 1 | 2 | 3;
    });
  }, []);

  const goQuoteBack = useCallback(() => {
    setQuoteStep((s) => {
      if (s <= 1) return 1;
      return (s - 1) as 1 | 2 | 3;
    });
  }, []);

  const persistHomepageBookingDraft = useCallback(
    (opts?: { service?: BookingServiceId }): boolean => {
      const serviceId = opts?.service ?? selectedService;
      const widgetSvc = homeWidgetServiceFromBookingId(serviceId);
      const date = todayBookingYmd();
      const extrasForPersist = snapshot ? filterExtrasForSnapshot(snapshot, selectedExtras, serviceId) : selectedExtras;
      const quotedPriceZar = computeCatalogQuoteZarForService(serviceId);
      const bookingData = {
        service: widgetSvc,
        bedrooms,
        bathrooms,
        extraRooms,
        extras: extrasForPersist,
        date,
        time: "",
        location: "",
        ...(quotedPriceZar != null ? { quotedPriceZar } : {}),
        estimateOnly: true,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(BOOKING_DATA_STORAGE_KEY, JSON.stringify(bookingData));
        return true;
      } catch (e) {
        console.error("Storage failed", e);
        return false;
      }
    },
    [
      bathrooms,
      bedrooms,
      computeCatalogQuoteZarForService,
      extraRooms,
      selectedExtras,
      selectedService,
      snapshot,
    ],
  );

  const handleContinueBooking = useCallback(() => {
    if (!canContinueBooking) return;
    userContinuedToBookingRef.current = true;
    setContinueLoading(true);
    try {
      trackGrowthEvent(
        "homepage_continue_booking",
        withHomepageContext({
          service: selectedService,
          extrasCount: selectedExtras.length,
          total: catalogQuoteZar ?? null,
        }),
      );
      const ok = persistHomepageBookingDraft();
      router.push(ok ? bookingHref : bookingHrefNoDraft);
    } catch (e) {
      console.error("Continue booking failed", e);
      setContinueLoading(false);
    }
  }, [
    canContinueBooking,
    catalogQuoteZar,
    persistHomepageBookingDraft,
    router,
    selectedExtras.length,
    selectedService,
  ]);

  const handleMobileStickyContinue = useCallback(() => {
    trackGrowthEvent(
      "homepage_cta_click",
      withHomepageContext({ cta: "mobile_sticky_bar", placement: "sticky_bar", quoteStep }),
    );
    scrollToQuote();
    if (quoteStep === 3 && canContinueBooking) {
      handleContinueBooking();
      return;
    }
    if (quoteStep === 1) {
      if (!canGoToExtras) return;
      setQuoteStep(2);
      return;
    }
    if (quoteStep === 2) {
      if (!canGoToReview) return;
      setQuoteStep(3);
    }
  }, [
    canContinueBooking,
    canGoToExtras,
    canGoToReview,
    handleContinueBooking,
    quoteStep,
  ]);

  const goBook = useCallback(
    (serviceOverride?: BookingServiceId, analyticsPlacement?: string) => {
      userContinuedToBookingRef.current = true;
      if (analyticsPlacement) {
        trackGrowthEvent(
          "homepage_cta_click",
          withHomepageContext({ cta: "book_cleaning", placement: analyticsPlacement }),
        );
      }
      const ok = persistHomepageBookingDraft(serviceOverride ? { service: serviceOverride } : undefined);
      router.push(ok ? bookingHref : bookingHrefNoDraft);
    },
    [persistHomepageBookingDraft, router],
  );

  const openHeroWhatsApp = useCallback(() => {
    trackGrowthEvent("homepage_cta_click", withHomepageContext({ cta: "whatsapp", placement: "hero" }));
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }, []);

  const scrollToQuoteWithTracking = useCallback((placement: string) => {
    trackGrowthEvent("homepage_cta_click", withHomepageContext({ cta: "get_instant_price", placement }));
    scrollToQuote();
  }, []);

  const openMapsSearch = useCallback((query: string) => {
    const q = encodeURIComponent(query);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener,noreferrer");
  }, []);

  const focusQuoteWithService = useCallback(
    (service: BookingServiceId, source: "footer_link" | "pricing_tier") => {
      trackGrowthEvent("homepage_service_select", withHomepageContext({ source, service }));
      handleServiceSelect(service);
      scrollToQuote();
    },
    [handleServiceSelect],
  );

  const focusQuoteFromServiceCard = useCallback(
    (serviceId: BookingServiceId, serviceTitle: string) => {
      trackGrowthEvent(
        "homepage_service_select",
        withHomepageContext({
          source: "service_card",
          service: serviceId,
          title: serviceTitle,
        }),
      );
      handleServiceSelect(serviceId);
      setQuoteStep(1);
      scrollToQuote();
      setQuoteAck(`${serviceTitle} selected`);
      setQuoteHighlight(true);
      const t = quoteAckTimers.current;
      if (t.clearAck) window.clearTimeout(t.clearAck);
      if (t.clearRing) window.clearTimeout(t.clearRing);
      t.clearAck = window.setTimeout(() => setQuoteAck(null), 2500);
      t.clearRing = window.setTimeout(() => setQuoteHighlight(false), 1000);
      focusQuoteFirstField();
    },
    [handleServiceSelect],
  );

  useEffect(() => {
    return () => {
      const t = quoteAckTimers.current;
      if (t.clearAck) window.clearTimeout(t.clearAck);
      if (t.clearRing) window.clearTimeout(t.clearRing);
    };
  }, []);

  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });

  return (
    <div className="min-h-screen bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-slate-900 selection:bg-blue-100 lg:pb-0">
      <section
        ref={heroRef}
        className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/40 pb-20 pt-6 lg:pb-32 lg:pt-10"
      >
        <div className="pointer-events-none select-none" aria-hidden="true">
          <div className="absolute right-0 top-0 h-[600px] w-[600px] -translate-y-1/2 translate-x-1/3 rounded-full bg-blue-100/40 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] -translate-x-1/4 translate-y-1/3 rounded-full bg-emerald-100/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={heroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-7 pt-4 lg:col-span-7"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-700">
                <MapPin className="h-3.5 w-3.5" />
                <span>Cape Town · Same-day available</span>
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-extrabold leading-[1.07] tracking-tight text-slate-900 sm:text-5xl lg:text-[56px]">
                  Book Trusted Home
                  <br />
                  <span className="text-blue-600">Cleaning</span> in Cape Town
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-slate-500 sm:text-xl">
                  Vetted, background-checked cleaners. Upfront pricing. Bookable in under 2 minutes — with same-day
                  slots available.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {[
                  { icon: Star, text: "4.8 rating" },
                  { icon: ShieldCheck, text: "Background-checked" },
                  { icon: Clock, text: "Same-day slots" },
                ].map(({ icon: Icon, text }) => (
                  <span
                    key={text}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm"
                  >
                    <Icon className="h-4 w-4 text-blue-500" />
                    <span>{text}</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                <button
                  type="button"
                  onClick={() => goBook(undefined, "hero")}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-4 text-base font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-[0.98] sm:w-auto sm:min-w-[12.5rem]"
                >
                  <span>Book a Cleaning</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={openHeroWhatsApp}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-7 py-4 text-base font-bold text-slate-800 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] sm:w-auto sm:min-w-[12.5rem]"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span>WhatsApp Us</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-slate-800">4.8</span>
                  <span className="text-sm text-slate-400">· 1,000+ cleans</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="-space-x-2 flex">
                    {["NK", "JT", "AM", "PL"].map((initials) => (
                      <div
                        key={initials}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-blue-400 to-blue-600"
                      >
                        <span className="text-[9px] font-bold text-white">{initials}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-slate-500">Trusted by Cape Town homeowners</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={heroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-5"
            >
              <div
                id="hero-quote"
                className={cn(
                  "sticky top-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 transition-[box-shadow,ring] duration-300",
                  quoteHighlight && "ring-2 ring-blue-400 ring-offset-2 ring-offset-white",
                )}
              >
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-100">Get Your Instant Price</p>
                      <h2 className="text-xl font-extrabold text-white">Customise your clean</h2>
                    </div>
                    <div className="shrink-0 text-right" aria-live="polite" aria-atomic="true">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100/90">Estimated Price</p>
                      {catalogReady && catalogQuoteZar != null ? (
                        <motion.p
                          key={catalogQuoteZar}
                          initial={{ scale: 1.04 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 420, damping: 22 }}
                          className="mt-0.5 text-2xl font-extrabold tracking-tight text-white tabular-nums sm:text-3xl"
                        >
                          R{catalogQuoteZar}
                        </motion.p>
                      ) : (
                        <div className="mt-1 space-y-1.5">
                          <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-white/25 sm:w-28" aria-hidden />
                          <p className="text-[11px] font-medium text-blue-100">Updating…</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-right text-[11px] text-blue-100/90">
                    Final price confirmed after selecting your time
                  </p>
                </div>
                <div className="mx-auto max-w-xl px-6 pb-6 pt-4">
                  <div className="min-w-0 space-y-4">
                    {quoteAck ? (
                      <p
                        className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-800"
                        role="status"
                      >
                        {quoteAck}
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                        <span>Step {quoteStep} of 3</span>
                        <span className="normal-case font-semibold text-blue-600">
                          {quoteStep === 1 ? "Service & home" : quoteStep === 2 ? "Extras" : "Review"}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={quoteStep} aria-valuemin={1} aria-valuemax={3}>
                        <motion.div
                          layout
                          className="h-full rounded-full bg-blue-600"
                          initial={false}
                          animate={{ width: `${(quoteStep / 3) * 100}%` }}
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      </div>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={quoteStep}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="space-y-5"
                      >
                        {quoteStep === 1 ? (
                          <>
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Service</label>
                              <div className="grid grid-cols-3 gap-2">
                                {quoteServices.map((service) => (
                                  <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => selectQuoteWidgetService(service.id)}
                                    className={`flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center text-xs font-bold transition-all ${
                                      selectedService === service.id
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                    }`}
                                    aria-pressed={selectedService === service.id}
                                  >
                                    <span className="leading-tight">{service.label}</span>
                                    {service.highDemand ? (
                                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
                                        High demand
                                      </span>
                                    ) : (
                                      <span
                                        className={
                                          selectedService === service.id
                                            ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                                            : "rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-700"
                                        }
                                      >
                                        Save up to 15%
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: "Bedrooms", value: bedrooms, setValue: setBedrooms },
                                { label: "Bathrooms", value: bathrooms, setValue: setBathrooms },
                                { label: "Extra Rooms", value: extraRooms, setValue: setExtraRooms, min: 0 },
                              ].map((item) => (
                                <div key={item.label}>
                                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
                                    {item.label}
                                  </label>
                                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                    <button
                                      type="button"
                                      {...(item.label === "Bedrooms" ? { "data-quote-first-input": "" } : {})}
                                      onClick={() => item.setValue(Math.max(item.min ?? 1, item.value - 1))}
                                      className="flex h-11 w-10 items-center justify-center border-r border-slate-200 text-lg font-bold text-slate-500 transition-colors hover:bg-slate-100"
                                    >
                                      -
                                    </button>
                                    <span className="flex-1 text-center text-sm font-bold text-slate-900">{item.value}</span>
                                    <button
                                      type="button"
                                      onClick={() => item.setValue(Math.min(6, item.value + 1))}
                                      className="flex h-11 w-10 items-center justify-center border-l border-slate-200 text-lg font-bold text-slate-500 transition-colors hover:bg-slate-100"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {quoteStep === 2 ? (
                          <>
                            {pricingLoading && addOns.length === 0 ? (
                              <div>
                                <div className="mb-2.5">
                                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Add Extras <span className="font-medium normal-case text-slate-300">(Optional)</span>
                                  </label>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs font-medium text-slate-500">
                                  Loading add-ons...
                                </div>
                              </div>
                            ) : (
                              <AddOnsSelector addOns={addOns} selectedIds={selectedExtras} onToggle={handleToggle} />
                            )}
                          </>
                        ) : null}
                        {quoteStep === 3 ? (
                          <p className="text-center text-sm text-slate-600">
                            Lock in this price — choose a time and address on the next screen.
                          </p>
                        ) : null}
                      </motion.div>
                    </AnimatePresence>
                    <div className="mt-4 border-t border-slate-100 pt-4 text-center">
                      <AvailabilityMessage />
                      <p className="mt-1 text-sm text-orange-500">{urgencyRotatingLine()}</p>
                    </div>
                    {quoteStep < 3 ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        {quoteStep > 1 ? (
                          <button
                            type="button"
                            onClick={goQuoteBack}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                            Back
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={goQuoteNext}
                          disabled={quoteStep === 1 ? !canGoToExtras : !canGoToReview}
                          className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-blue-200/50 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                    {quoteStep === 3 ? (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={goQuoteBack}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={handleContinueBooking}
                            disabled={!canContinueBooking}
                            className="flex min-w-[12rem] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white shadow-lg shadow-blue-200 transition-[opacity,background-color,transform] duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span>{continueLoading ? "Preparing your booking…" : "Continue to Booking"}</span>
                            {!continueLoading ? <ArrowRight className="h-4 w-4" /> : null}
                          </button>
                        </div>
                        <p className="text-center text-xs text-slate-500">
                          Takes less than 2 minutes • No payment required
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <TrustBar />

      <section id="services" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 max-w-2xl">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">Our Services</p>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Every cleaning service
              <br />
              Cape Town needs
            </h2>
            <p className="mt-4 text-lg text-slate-500">Pick the right level of clean for your home, schedule, and budget.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {services.map((service) => (
              <motion.button
                key={service.id}
                type="button"
                onClick={() => focusQuoteFromServiceCard(service.bookingServiceId, service.title)}
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ duration: 0.2 }}
                className={`group relative w-full cursor-pointer rounded-2xl border p-6 text-left transition-all ${
                  service.highlight
                    ? "border-blue-500 bg-blue-600 text-white shadow-xl shadow-blue-200"
                    : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-lg hover:shadow-blue-100/50"
                }`}
              >
                {service.highlight ? (
                  <div className="absolute right-4 top-4 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold text-white">
                    Popular
                  </div>
                ) : null}
                <div
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${
                    service.highlight ? "bg-white/20" : "bg-blue-100"
                  }`}
                >
                  <service.icon className={`h-5 w-5 ${service.highlight ? "text-white" : "text-blue-600"}`} />
                </div>
                <h3 className={`mb-2 text-lg font-extrabold ${service.highlight ? "text-white" : "text-slate-900"}`}>
                  {service.title}
                </h3>
                <p className="mb-2">
                  {service.marketingHighDemand ? (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
                      High demand
                    </span>
                  ) : (
                    <span
                      className={
                        service.highlight
                          ? "inline-flex rounded-full bg-white/20 px-2 py-1 text-xs font-semibold text-white"
                          : "inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700"
                      }
                    >
                      Save up to 15%
                    </span>
                  )}
                </p>
                <p className={`mb-5 text-sm leading-relaxed ${service.highlight ? "text-blue-100" : "text-slate-500"}`}>
                  {service.description}
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${service.highlight ? "text-blue-200" : "text-slate-400"}`}>
                      From
                    </p>
                    <p className={`text-2xl font-extrabold ${service.highlight ? "text-white" : "text-slate-900"}`}>
                      R{service.from}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-sm font-bold ${service.highlight ? "text-white" : "text-blue-600"}`}>
                    <span>Book now</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-y border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">Transparent Pricing</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Cleaning Prices in Cape Town</h2>
            <p className="mt-4 text-lg text-slate-500">Your exact total is shown before you pay. Zero hidden fees.</p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.id}
                className={`flex flex-col rounded-2xl border p-7 ${
                  tier.accent ? "border-blue-600 bg-blue-600 shadow-2xl shadow-blue-300/40" : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                {tier.accent ? <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-200">Most thorough</p> : null}
                <h3 className={`mb-1 text-xl font-extrabold ${tier.accent ? "text-white" : "text-slate-900"}`}>{tier.name}</h3>
                <div className="mb-5 mt-3 flex items-baseline gap-1">
                  <span className={`text-xs font-bold ${tier.accent ? "text-blue-200" : "text-slate-400"}`}>From</span>
                  <span className={`text-4xl font-extrabold ${tier.accent ? "text-white" : "text-slate-900"}`}>R{tier.from}</span>
                </div>
                <ul className="flex-1 space-y-3">
                  {tier.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2.5">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tier.accent ? "bg-white/20" : "bg-blue-50"}`}>
                        <Check className={`h-3 w-3 ${tier.accent ? "text-white" : "text-blue-600"}`} />
                      </div>
                      <span className={`text-sm font-medium ${tier.accent ? "text-blue-100" : "text-slate-600"}`}>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => focusQuoteWithService(tier.bookingServiceId, "pricing_tier")}
                  className={`mt-7 w-full rounded-xl py-3 text-sm font-bold transition-all ${
                    tier.accent ? "bg-white text-blue-600 hover:bg-blue-50" : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Get exact price
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">Why Shalean</p>
            <h2 className="mb-6 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              A cleaning service you can actually rely on
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-slate-500">
              We don&apos;t just connect you with any cleaner. Every Shalean cleaner is verified, trained, and rated by
              real customers after every job.
            </p>
            <button
              type="button"
              onClick={() => scrollToId("how-it-works")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700"
            >
              See how it works
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {whyItems.map((item) => (
              <div key={item.title} className="group rounded-2xl border border-slate-100 bg-slate-50 p-5 transition-all hover:border-blue-200 hover:bg-blue-50/20">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white transition-colors group-hover:border-blue-200">
                  <item.icon className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="mb-1.5 text-sm font-extrabold text-slate-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-400">Simple process</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Book in under 2 minutes</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {index < steps.length - 1 ? (
                  <div className="absolute left-full top-7 z-0 hidden h-px -translate-y-px bg-slate-700 lg:block" style={{ width: "calc(100% - 3rem)" }} />
                ) : null}
                <div className="relative z-10 h-full rounded-2xl border border-slate-700/60 bg-slate-800/60 p-6">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/20">
                    <span className="text-sm font-extrabold text-blue-400">{step.num}</span>
                  </div>
                  <h3 className="mb-2 text-base font-extrabold text-white">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{step.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="service-areas" className="border-b border-slate-100 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-600">Service areas</p>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Cleaning across Cape Town</h2>
            </div>
            <button
              type="button"
              onClick={() => openMapsSearch("Cape Town, South Africa")}
              className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-blue-600 transition-colors hover:text-blue-700"
            >
              View all areas <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {locations.map((location) => (
              <button
                key={location}
                type="button"
                onClick={() => openMapsSearch(`${location}, Cape Town, South Africa`)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {location}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-600">Reviews</p>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">What Cape Town homeowners say</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-sm font-bold text-slate-700">4.8 · 1,000+ reviews</span>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="flex flex-col justify-between rounded-2xl bg-blue-600 p-7 lg:col-span-1">
              <div>
                <div className="mb-4 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-white text-white" />
                  ))}
                </div>
                <blockquote className="mb-6 text-lg font-medium leading-relaxed text-white">&quot;{reviews[0].text}&quot;</blockquote>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <span className="text-xs font-extrabold text-white">
                    {reviews[0].author
                      .split(" ")
                      .map((name) => name[0])
                      .join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{reviews[0].author}</p>
                  <p className="text-xs text-blue-200">{reviews[0].location}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {reviews.slice(1).map((review) => (
                <div key={review.author} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <div className="mb-3 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <blockquote className="mb-4 text-sm leading-relaxed text-slate-700">&quot;{review.text}&quot;</blockquote>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                      <span className="text-xs font-bold text-blue-600">
                        {review.author
                          .split(" ")
                          .map((name) => name[0])
                          .join("")}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{review.author}</p>
                      <p className="text-xs text-slate-400">{review.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">The Shalean difference</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Before &amp; after results</h2>
            <p className="mt-4 text-lg text-slate-500">Real results from Cape Town homes. See what a Shalean clean actually looks like.</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            {[
              { label: "Before", bg: "bg-slate-100", iconBg: "bg-slate-200", Icon: Home, iconColor: "text-slate-400", text: "Before cleaning photo" },
              { label: "After", bg: "bg-blue-50", iconBg: "bg-blue-100", Icon: Sparkles, iconColor: "text-blue-500", text: "After Shalean clean" },
            ].map(({ label, bg, iconBg, Icon, iconColor, text }) => (
              <div key={label} className={`group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 ${bg}`}>
                <div className="flex h-full w-full items-center justify-center">
                  <div className="space-y-3 text-center">
                    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${iconBg}`}>
                      <Icon className={`h-7 w-7 ${iconColor}`} />
                    </div>
                    <p className={`text-sm font-medium ${label === "After" ? "text-blue-400" : "text-slate-400"}`}>{text}</p>
                  </div>
                </div>
                <div className="absolute bottom-4 left-4">
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white ${label === "After" ? "bg-blue-600" : "bg-slate-900/80"}`}>
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <p className="text-sm text-slate-500">
              <strong className="text-slate-700">Not 100% satisfied?</strong>{" "}
              <span>We&apos;ll send a cleaner back within 24 hours — free of charge.</span>
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-slate-50 py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">FAQs</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div key={faq.question} className={`overflow-hidden rounded-2xl border bg-white transition-colors ${openFaq === index ? "border-blue-200" : "border-slate-200"}`}>
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left focus:outline-none"
                >
                  <span className="text-sm font-bold text-slate-900 sm:text-base">{faq.question}</span>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${
                      openFaq === index ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${openFaq === index ? "rotate-180 text-white" : "text-slate-400"}`} />
                  </div>
                </button>
                <AnimatePresence>
                  {openFaq === index ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="border-t border-slate-100 px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-500">{faq.answer}</div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-blue-600 py-24">
        <div className="pointer-events-none select-none" aria-hidden="true">
          <div className="absolute right-0 top-0 h-[500px] w-[500px] -translate-y-1/2 translate-x-1/4 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] -translate-x-1/4 translate-y-1/3 rounded-full bg-blue-700/30 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl space-y-6 px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-300">Ready to book?</p>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">Your cleanest home is one booking away</h2>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-blue-100">
            Get your instant price in seconds. Same-day slots available. No card required until checkout.
          </p>
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={() => scrollToQuoteWithTracking("final_cta")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-extrabold text-blue-600 shadow-xl shadow-blue-900/20 transition-all hover:bg-blue-50 active:scale-[0.98]"
            >
              <span>Get Instant Price</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackGrowthEvent(
                  "homepage_cta_click",
                  withHomepageContext({ cta: "talk_whatsapp", placement: "final_cta" }),
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-bold text-white transition-all hover:border-white/60 hover:bg-white/5"
            >
              Talk to us
            </a>
          </div>
          <div className="flex items-center justify-center gap-6 pt-4">
            {["No hidden fees", "Satisfaction guarantee", "Cancel anytime"].map((label) => (
              <div key={label} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-300" />
                <span className="text-xs font-medium text-blue-200">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 py-14 text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col justify-between gap-10 md:flex-row">
            <div className="max-w-xs">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="text-xl font-extrabold text-white">Shalean</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                Cape Town&apos;s trusted home cleaning platform. Vetted cleaners, upfront pricing, reliable service.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              {[
                ["Services", "Standard Cleaning", "Deep Cleaning", "Airbnb Turnover", "Move-Out Clean", "Carpet Cleaning"],
                ["Areas", "Cape Town CBD", "Sea Point", "Claremont", "Table View", "Green Point"],
                ["Company", "About", "FAQ", "Contact", "Privacy Policy", "Terms"],
              ].map(([title, ...links]) => (
                <div key={title}>
                  <p className="mb-4 font-bold text-white">{title}</p>
                  <ul className="space-y-2.5">
                    {links.map((link) => {
                      const href = footerLinkHref(title, link);
                      const external = href.startsWith("http") || href.startsWith("mailto:");
                      const serviceBook = title === "Services" ? footerServiceBookingId(link) : null;
                      return (
                        <li key={link}>
                          <a
                            href={href}
                            className="transition-colors hover:text-white"
                            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            onClick={(e) => {
                              if (!serviceBook) return;
                              e.preventDefault();
                              if (href === bookingHref) {
                                goBook(serviceBook, "footer_book");
                                return;
                              }
                              focusQuoteWithService(serviceBook, "footer_link");
                            }}
                          >
                            {link}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs text-slate-600 sm:flex-row">
            <p>© {new Date().getFullYear()} Shalean Cleaning Services. All rights reserved.</p>
            <p>Designed for Cape Town homes.</p>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5 shadow-2xl shadow-slate-900/20 lg:hidden">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Step {quoteStep} of 3</p>
          <p className="truncate text-lg font-extrabold leading-tight text-slate-900 tabular-nums">
            {catalogReady && catalogQuoteZar != null ? `R${catalogQuoteZar}` : "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleMobileStickyContinue}
          disabled={
            continueLoading ||
            (quoteStep === 1 && !canGoToExtras) ||
            (quoteStep === 2 && !canGoToReview) ||
            (quoteStep === 3 && !canContinueBooking)
          }
          className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-200 transition-opacity duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {continueLoading ? "…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
