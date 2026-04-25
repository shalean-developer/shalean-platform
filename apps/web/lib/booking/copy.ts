/**
 * Conversion-focused booking microcopy (static — safe to import anywhere).
 */
export const bookingCopy = {
  entry: {
    title: "Book your clean in 60 seconds",
    subtitle: "Add your address to see your quote.",
    cta: "Continue",
    addressPlaceholder: "Enter full address (street, suburb, city)",
    addressHelper: "Please include street name, suburb, and city for accurate booking.",
    propertyOptions: ["Apartment", "House", "Studio", "Office"] as const,
    addressLabel: "Your address",
    propertyLabel: "Home type",
    propertyHint: "Apartment is pre-selected. Update if it doesn't match your home.",
    socialProof: "Trusted by 500+ homes in Cape Town",
  },

  quote: {
    title: "What kind of clean do you need?",
    serviceSectionTitle: "Cleaning type",
    mostPopularLabel: "Most popular",
    /** Shown on Deep Cleaning card (secondary to “Most popular” on Standard). */
    recommendedServiceLabel: "Recommended",
    priceLabel: "Total",
    trust: "✅ Your price is set when you pick a time — no surprises at checkout",
    supporting: "Includes professional cleaning and supplies",
    reassurance: "Next you’ll add home details, then choose a time to lock your total",
    urgency: "🔥 Most customers complete their booking in under 60 seconds",
    cta: "Continue",
    earlyTrust: "⭐ Trusted by homeowners across Cape Town",
    notesHeading: "Anything else we should know?",
    notesPlaceholder: "Access codes, pets, focus areas… (optional)",
  },

  details: {
    title: "Tell us about your home",
    subtitle: "We’ve pre-filled this for you — adjust if needed",
    extrasTitle: "Add extras (optional)",
    reassurance: "You can change this until you pick a time — then add-ons lock with your visit total.",
    cta: "Continue to schedule",
    cleanTypeTitle: "Clean type",
    cleanTypeHint: "Most homes stay on Standard — switch only if you need something different.",
    homeDetailsTitle: "Home details",
    homeDetailsHint: "We use this to estimate time and price accurately.",
    priceLiveHint: "Your estimate updates as you adjust rooms and extras.",
  },

  when: {
    title: "Choose your preferred time",
    availability: "✔ Cleaner available for this time",
    urgency: "⚡ Only a few slots left for tomorrow",
    recommended: "⭐ Recommended",
    cta: "Continue to checkout",
    intro: "Pick a time that works for you — we’ll hold your price for this visit.",
    dateHeading: "Date",
    morningHeading: "Morning",
    afternoonHeading: "Afternoon",
    morningHint: "08:00 – 11:00",
    afternoonHint: "12:00 – 16:00",
    seeMoreTimes: "See more times",
    badgeHintRecommended: "Best balance of price & availability",
    badgeHintBestValue: "Save money — lowest price today",
    badgeHintFillingFast: "Limited cleaner availability",
    spotsLeftToday: (n: number) =>
      n === 1 ? "Only 1 slot left today" : `Only ${n} slots left today`,
  },

  checkout: {
    title: "Confirm your booking",
    trust: [
      "⭐ Rated 4.8 by homeowners in Cape Town",
      "🛡️ Not happy? We’ll come back and re-clean for free",
      "👩‍🔧 Experienced, background-checked cleaners",
      "🔒 Secure payment powered by Paystack",
    ] as const,
    trustShort: ["No charge until you pay below", "Secure checkout (Paystack)", "Instant confirmation email"] as const,
    cta: "Confirm & Secure Your Cleaner",
    subtext: "✔ Instant booking confirmation",
    subtitle: "Review your visit, then pay securely to confirm.",
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
    payFooterTrustLine: "Paystack · PCI-DSS · 256-bit encryption · Instant email confirmation",
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

  errors: {
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
