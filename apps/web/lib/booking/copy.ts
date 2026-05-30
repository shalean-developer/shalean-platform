/**
 * Conversion-focused booking microcopy (static — safe to import anywhere).
 */
export const bookingCopy = {
  entry: {
    title: "Book a trusted home cleaner in Cape Town",
    cta: "Continue",
    suburbLabel: "Service area (suburb)",
    suburbPlaceholder: "Choose your suburb",
    suburbHelper: "We match cleaners and slots to this area. Pick the suburb where the clean happens.",
    streetLabel: "Street address (optional)",
    streetPlaceholder: "Unit, street number, estate name…",
    streetHelper: "Helps cleaners find you; you can add or edit this later.",
    addressPlaceholder: "Enter full address (street, suburb, city)",
    addressHelper: "Please include street name, suburb, and city for accurate booking.",
    /** Entry page subheading (under the main title). */
    addressMicrocopy: "Choose your service area, then tell us your home type — we match you with cleaners who work in that suburb.",
    propertyOptions: ["Apartment", "House", "Studio", "Office"] as const,
    addressLabel: "Your address",
    propertyLabel: "Home type",
    propertyHint: "Pick the option that best matches your home.",
    socialProof: "4.8★ from 129 Google reviews",
    /** Shown when service-locations loaded OK but every area has zero active cleaners (all busy / none rostered). */
    emptyServiceAreaCoverage:
      "No cleaners available in your area right now. Try a nearby suburb or check back later.",
  },

  quote: {
    title: "Choose your cleaning type",
    serviceSectionTitle: "Cleaning type",
    mostPopularLabel: "🔥 Most booked",
    /** Shown on Deep Cleaning card (secondary to “Most popular” on Standard). */
    recommendedServiceLabel: "Recommended",
    /** Marketing “from” hints on service cards — not live quotes. */
    serviceFromPriceLine: {
      standard_cleaning: "Standard",
      airbnb_cleaning: "Airbnb",
      deep_cleaning: "Deep — from R650",
      move_cleaning: "Move out — from R750",
      carpet_cleaning: "Carpet — from R350",
    } as const,
    priceLabel: "Total",
    trust: "✅ Your price is set when you pick a time — no surprises at checkout",
    supporting: "Includes professional cleaning and supplies",
    reassurance: "Next you’ll add home details, then choose a time to lock your total",
    urgency: "🔥 Most customers complete their booking in under 60 seconds",
    cta: "Continue",
    earlyTrust: "⭐ Trusted by homeowners across Cape Town",
    /** Mid-flow social proof after service selection. */
    midFlowSocialProof: "4.8★ from 129 Google reviews",
    notesHeading: "Anything else we should know?",
    notesPlaceholder: "Access codes, pets, focus areas… (optional)",
  },

  details: {
    title: "Service & Property",
    stepSubtitle: "Choose service and set property details.",
    priceShownBadge: "Price shown",
    yourServiceLabel: "Your service",
    propertySectionLabel: "Property",
    changeService: "Change service",
    /** Collapsed `<summary>` primary line — blueprint default. */
    showExtrasCollapsed: "Show extras",
    footerTrustCompact: "No hidden fees",
    priceAnchorFootnote: "Transparent pricing · Vetted cleaners · No surprise charges",
    extrasTitle: "Add extras (optional)",
    extrasCollapsedHint: "Optional — tap to add services",
    reassurance: "You can change this until you pick a time — then add-ons lock with your visit total.",
    cta: "Continue to schedule",
    cleanTypeTitle: "Clean type",
    cleanTypeHint: "Most homes stay on Standard — switch only if you need something different.",
    homeDetailsTitle: "Home details",
    homeDetailsHint: "Bedrooms, bathrooms, and extra rooms — we use this to estimate time and price accurately.",
    priceLiveHint: "Your estimate updates as you adjust rooms and extras.",
    priceTrust: ["No hidden fees", "Vetted cleaners", "Secure payment"] as const,
    priceTrustAlt: ["Upfront pricing", "Vetted cleaners", "Pay securely"] as const,
    extrasTitleAlt: "Customize with extras (optional)",
  },

  /** Path checkout `/booking/schedule` — UI copy only (logic unchanged). */
  checkoutSchedule: {
    areaLabel: "Where are we cleaning?",
    areaSearchPlaceholder: "Search your area",
    dateLabel: "Pick a date",
    timeLabel: "Pick a time",
    seeMoreTimeSlots: "See more time slots",
    seeFewerTimeSlots: "See fewer time slots",
    addressLabel: "Street address",
    addressPlaceholder: "Street number, unit, gate code, estate…",
    addressMicrocopy: "Street, unit, gate code — for your door.",
    addressEdit: "Edit",
    availabilityLead: "Good news! We have availability on",
    noTimesTitle: "No times for this day",
    noTimesBody: "Try another date or a different time of day — new slots open regularly.",
    areaRequiredForTimes: "Select your area above to see available times.",
    resolvingArea: "Matching your area to our service map…",
    loadingTimes: "Checking available times…",
    timesLoadError: "We couldn’t load times for this day. Try another date or check your connection.",
    noTimesJobTooLong:
      "This clean is estimated longer than a single day’s booking window. Try fewer add-ons or rooms, or contact us for a custom schedule.",
    continueToCleaner: "Continue to cleaner",
    continueToPayment: "Continue to payment",
    slotPricingFootnote: "Price includes your selected time slot.",
    summaryTrust: "Secure & trusted",
    morning: "Morning",
    midday: "Midday",
    evening: "Evening",
    scrollDatesLeft: "Scroll dates left",
    scrollDatesRight: "Scroll dates right",
  },

  /** Path checkout `/booking/cleaner` — UI copy only (selection logic unchanged). */
  checkoutCleaner: {
    title: "Cleaner",
    subtitle: "Best available cleaner is auto-selected.",
    subtitleSecondary: "Change or choose manually (optional).",
    badge: "Auto-assigned by default",
    bestAvailableTitle: "Best available cleaner",
    bestAvailableBody: "We’ll match you with the best available cleaner for your booking.",
    recommendedBadge: "Recommended",
    manualTitle: "Choose someone specific (optional)",
    manualSubtitleMobile: "Browse cleaners",
    manualSubtitleDesktop: "Browse cleaners or pick your favourite.",
    /** Shown on cleaner profile rows when strong social proof */
    topRatedLine: "Top rated cleaner",
    continueToReview: "Continue to review",
  },

  /** Path checkout `/booking/payment` — UI copy only (Paystack + submit flow unchanged). */
  checkoutPayment: {
    title: "Review & Pay",
    stepSubtitle: "Review details and pay securely.",
    reviewCardTitle: "Review your booking",
    contactEyebrow: "Contact details",
    contactFullNameLabel: "Full name",
    contactEmailLabel: "Email",
    contactPhoneLabel: "Phone",
    contactNamePlaceholder: "Jane Doe",
    contactEmailPlaceholder: "you@example.com",
    contactPhonePlaceholder: "+27 …",
    locationFallback: "Location on file",
    payCta: "Pay & confirm",
    payProcessing: "Processing…",
    paymentMethodTitle: "Payment method",
    creating: "Creating booking…",
    secureBelowCta: "Secure checkout",
    secureHint: "Secure checkout on the next screen.",
    cleanerBestAvailable: "Best available cleaner",
    cleanerSelectedShort: "Selected cleaner",
    cleanerSidebar: "Best available",
    extrasNone: "None",
    extrasSelected: (n: number) => `${n} selected`,
    trustSecure: "100% Secure",
    trustNoFees: "No hidden fees",
    paystackWordmark: "Paystack",
  },

  when: {
    title: "Pick a time — we’ll hold your price for this visit",
    availability: "✔ Cleaner available for this time",
    urgency: "⚡ Only a few slots left for tomorrow",
    recommended: "⭐ Recommended",
    cta: "Continue to checkout",
    intro: "Pick a time that works for you — we’ll hold your price for this visit.",
    scheduleMicroBenefit: "Flexible times are often cheaper",
    loadingAvailability: "Finding the best available times for you…",
    emptyPrerequisites: "Select your area and date to see available times",
    disabledContinue: "Select a date and time to continue",
    dateHeading: "Date",
    morningHeading: "Morning",
    afternoonHeading: "Afternoon",
    morningHint: "08:00 – 11:00",
    afternoonHint: "12:00 – 16:00",
    seeMoreTimes: "See more times",
    badgeHintRecommended: "Best balance of price & availability",
    badgeHintBestValue: "Save money — lowest price today",
    badgeHintFillingFast: "Limited cleaner availability",
    /** Short labels on slot cards (strategy badges). */
    slotBadgePopular: "🔥 Popular",
    slotBadgeBestPrice: "Best price",
    slotBadgeSpotsLeft: (n: number) =>
      n === 1 ? "Only 1 spot left" : `Only ${n} spots left`,
    spotsLeftToday: (n: number) =>
      n === 1 ? "Only 1 slot left today" : `Only ${n} slots left today`,
    /** Above slot grid when service area is known — light urgency, no fake counts. */
    slotsFillQuicklyInArea: "Slots fill quickly in your area — pick a time to hold your spot.",
    /** After a successful lock (reinforces availability, not payment). */
    timeSelectedAvailabilityConfirmed: "✔ Time selected — cleaner availability confirmed",
    showLaterTimes: "Show later times",
    recommendedForYou: "⭐ Recommended for you",
    mostPeopleChooseThisTime: "Most people choose this time",
    peakTimeLabel: "Peak time",
    fastestToConfirm: "Fastest to confirm",
    checkingAvailabilityShort: "Checking availability…",
  },

  /** Schedule-step cleaner selection (client UX; strict availability unchanged). */
  cleaner: {
    recommendedLabel: "⭐ Recommended for your booking",
    premiumBadge: "💎 Top-rated cleaner",
    premiumValue: "💎 Top-rated cleaner — trusted for better results",
    standardLabel: "Standard cleaner — good for regular cleaning",
    upgradePrompt: "Upgrade to a top-rated cleaner for better results",
    mostCustomers: "Most customers choose this option",
    premiumSocialProof: "Chosen by many customers for higher-quality results",
    betterResultsLine: "Better results with a top-rated cleaner",
    qualityRatedHigher: "Customers rate this cleaner higher for quality",
    worthItLine: "Worth it for higher-quality cleaning",
    trustLine: "✔ Background checked • Reliable • Trusted by customers",
    changeToggle: "Want to choose someone specific?",
    showMore: "Show more cleaners",
    selectedConfirm: "✔ Cleaner selected — highly rated and available",
    selectedBadge: "Selected",
    assignAutomaticallyTitle: "Best available cleaner",
    assignAutomaticallyHint: "Recommended — we’ll match you based on availability and performance.",
    assignAutomaticallyTitleAlt: "Let Shalean pick the best cleaner",
    assignAutomaticallyHintAlt: "Fastest option — we’ll match you with a vetted cleaner who fits your time.",
    emptyAssign: "We’ll assign the best available cleaner for you",
    emptyContinueHint: "You can continue — we’ll match you at confirmation.",
    sectionIntro: "We’ll match you with the best available cleaner for your booking. Choosing someone specific is optional.",
    autoAssignOnlyHint: "We’ll assign the best available cleaner for this visit.",
    tapToConfirmTopMatch: "Want more control? Open the list below.",
  },

  checkout: {
    /** Shown when a slot lock is active on the payment step. */
    lockedCheckoutNotice:
      "This booking is locked for checkout. Complete payment below to confirm your visit.",
    title: "Review & Pay",
    trust: [
      "⭐ 4.8★ average on Google (129 reviews)",
      "🛡️ Not happy? We’ll come back and re-clean for free",
      "👩‍🔧 Experienced, background-checked cleaners",
      "🔒 Secure payment powered by Paystack",
    ] as const,
    cta: "Pay & confirm booking",
    ctaAlt: "Secure my booking",
    subtext: "✔ Instant booking confirmation",
    subtitle: "Review details and pay securely.",
    cleanerHeading: "Your cleaner",
    cleanerHint: "Select a cleaner above to continue — your price stays the same.",
    summaryWhat: "What",
    summaryWhere: "Where",
    summaryWhen: "When",
    addOnsLabel: "Add-ons (in visit total)",
    /** Shown at checkout — extras are persisted on the booking and sent to the cleaner. */
    extrasGuarantee: "✔ All selected extras are included and guaranteed for this visit.",
    /** Footer (step 5): when lock time can’t be parsed — keep to one line. */
    slotHeldFallback: "Price reserved for this visit — complete checkout soon.",
    /** Footer trust strip under the CTA (single line). */
    payFooterTrustLine: "SSL secure · Powered by Paystack · Secure checkout",
    paymentTrust: ["SSL secure", "Powered by Paystack", "Secure checkout"] as const,
    paymentTrustAlt: ["Secure checkout", "Powered by Paystack", "Instant confirmation"] as const,
    /** Shown above the confirm / pay button on checkout. */
    confirmTrustBullets: [
      "✔ Satisfaction guarantee — we re-clean if needed",
      "✔ No hidden fees",
      "✔ Cancel or reschedule easily",
    ] as const,
    /** Checkout breakdown — same wording anywhere rounding is mentioned. */
    pricingRoundingNote: "Prices may be slightly rounded for simplicity.",
    /** Homepage hero widget — sits next to the estimate total. */
    widgetEstimateNote: "Estimated price — updates when you pick a time",
  },

  progress: {
    psychAfterDetails: "Almost there",
    psychSchedule: "Pick your time",
    psychCheckout: "Final step",
  },

  stickyBar: {
    total: "Total",
    cta: "Continue",
    urgencySlotsFilling: "⚡ Slots filling fast",
    urgencyCleanerAvailable: "✔ Cleaner available",
  },

  /** Mobile footer insight banner (quote + details steps, stacked above sticky price bar). */
  footerInsight: {
    /** Compact headline (Sweep-style strip); emphasis word in banner JSX. */
    bannerHeadlineLead: "✓ Slots available",
    bannerHeadlineEmphasis: "today",
    bannerHeadlineTail: "— next, lock your time for the final price.",
    bannerCta: "Got it",
    slotsToday: "✔ Slots available today",
    finalPriceNote: "Final price may change based on your selected time",
    flexibleTime: "You may get a lower price by choosing a flexible time",
  },

  errors: {
    suburb: "Please choose your service area (suburb) to continue",
    address: "Please enter your address to continue",
    addressShort: "Add a few more characters so we can price your area",
    property: "Please choose a home type to continue",
    time: "Please select a time to continue",
    selectTimeFirst: "Please select a time to continue",
  },

  exitIntent: {
    title: "Almost done 🎉",
    offer: "Your cleaner is still available at this time. Complete your booking now before the slot is taken.",
    cta: "Complete booking →",
    dismiss: "Continue later",
  },

  summary: {
    priceSecured: "✅ Price secured",
    previewHint: "Your price is set for this clean — pick a time on the next step.",
    lockedHint: "Price matches checkout — no surprises.",
    selectTimeHint: "Pick a time to see your final total",
  },
} as const;
