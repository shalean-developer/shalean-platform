/**
 * Conversion-focused booking microcopy (static — safe to import anywhere).
 */
export const bookingCopy = {
  entry: {
    title: "Book a trusted home cleaner in seconds",
    subtitle: "Takes less than 60 seconds • No payment required yet",
    cta: "Get Instant Price",
    addressPlaceholder: "Enter your address",
    propertyOptions: ["Apartment", "House"] as const,
    addressLabel: "Where should we come?",
    propertyLabel: "Property type",
  },

  quote: {
    title: "Choose your cleaning package",
    priceLabel: "Total",
    trust: "✅ Your price is set when you pick a time — no surprises at checkout",
    supporting: "Includes professional cleaning and supplies",
    reassurance: "Next you’ll add home details, then choose a time to lock your total",
    urgency: "🔥 Most customers complete their booking in under 60 seconds",
    cta: "Continue Booking",
    eyebrow: "Your instant price",
    earlyTrust: "⭐ Trusted by homeowners across Cape Town",
  },

  details: {
    title: "Tell us about your home",
    subtitle: "We’ve pre-filled this for you — adjust if needed",
    extrasTitle: "Add extras (optional)",
    reassurance: "You can change this anytime before payment",
    cta: "Continue to Schedule",
    cleanTypeTitle: "Clean type",
    cleanTypeHint: "Most homes stay on Standard — switch only if you need something different.",
    homeDetailsTitle: "Home details",
    homeDetailsHint: "Rooms help us plan time on site — adjust to match your space.",
  },

  when: {
    title: "Choose your preferred time",
    availability: "✔ Cleaner available for this time",
    urgency: "⚡ Only a few slots left for tomorrow",
    recommended: "⭐ Recommended",
    cta: "Continue to Checkout",
    intro: "Pick a time that works for you — we’ll hold your price for this visit.",
    dateHeading: "Date",
    morningHeading: "Morning",
    afternoonHeading: "Afternoon",
    morningHint: "08:00 – 11:00",
    afternoonHint: "12:00 – 16:00",
  },

  checkout: {
    title: "Confirm your booking",
    trust: [
      "⭐ Rated 4.8 by homeowners in Cape Town",
      "🛡️ Not happy? We’ll come back and re-clean for free",
      "👩‍🔧 Experienced, background-checked cleaners",
      "🔒 Secure payment powered by Paystack",
    ] as const,
    cta: "Confirm & Secure Your Cleaner",
    subtext: "✔ Instant booking confirmation",
    subtitle: "Pick your cleaner, check the summary, then pay securely.",
    cleanerHeading: "Your cleaner",
    cleanerHint: "Select a cleaner above to continue — your price stays the same.",
    speedBeforePay: "⏱ Takes less than 1 minute to complete",
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
    property: "Please choose apartment or house to continue",
    time: "Select a time to secure your cleaner",
    selectTimeFirst: "Please select a time first",
  },

  exitIntent: {
    title: "Wait — don’t miss your spot 👀",
    offer: "Get R50 off your first cleaning if you book now",
    cta: "Complete Booking",
    dismiss: "Not now",
  },

  /** Contextual exit-intent (shown by step); fallback = `exitIntent`. */
  exitIntentByStep: {
    quote: {
      title: "Don’t lose your price 👀",
      offer: "Your cleaning price is ready — complete your booking now",
    },
    when: {
      title: "This time slot may go fast ⚡",
      offer: "Secure your preferred time before it’s taken",
    },
    checkout: {
      title: "You’re almost done 👀",
      offer: "Confirm your cleaner in under 60 seconds",
    },
  },

  summary: {
    priceSecured: "✅ Price secured",
    previewHint: "Your price is set for this clean — pick a time on the next step.",
    lockedHint: "Price matches checkout — no surprises.",
    selectTimeHint: "Pick a time to see your final total",
  },
} as const;
