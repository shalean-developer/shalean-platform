/** Production booking screens only; never collect entered form values here. */
const SECTIONS: Record<number, readonly { key: string; label: string }[]> = {
  1: [
    { key: "address", label: "Address" }, { key: "property", label: "Property" },
    { key: "rooms", label: "Rooms" }, { key: "pets", label: "Pets & equipment" },
    { key: "equipment", label: "Extras" },
  ],
  2: [
    { key: "booking_type", label: "Booking type" },
    { key: "date_time", label: "Date & time" }, { key: "cleaner", label: "Cleaner" },
  ],
};

export function liveRegularSection(step: number, section: unknown): string | undefined {
  return SECTIONS[step]?.find((item) => item.key === section)?.key;
}

export type FunnelPosition = { step: 1 | 2 | 3 | 4; section?: string };

export function bookingFunnelNavigation(previous: FunnelPosition, current: FunnelPosition) {
  if (previous.step === current.step && previous.section === current.section) return null;
  let forward = current.step > previous.step;
  if (current.step === previous.step) {
    const screens = SECTIONS[current.step] ?? [];
    const from = screens.findIndex((item) => item.key === previous.section);
    const to = screens.findIndex((item) => item.key === current.section);
    if (from < 0 || to < 0) return null;
    forward = to > from;
  }
  return {
    step: previous.step,
    event: forward ? "next" as const : "back" as const,
    metadata: {
      from_step: previous.step, to_step: current.step,
      ...(previous.section ? { section: previous.section, from_section: previous.section } : {}),
      ...(current.section ? { to_section: current.section } : {}),
    },
  };
}

/** Old clients may still submit href. Strip it at ingestion as well as at emission. */
export function sanitizeBookingNavigationMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  delete out.href;
  if (typeof out.pathname === "string") {
    try {
      const path = new URL(out.pathname, "https://shalean.co.za").pathname;
      const publicRoute = /^\/book(?:\/(?:regular-cleaning|deep-cleaning|moving-cleaning|office-cleaning|carpet-cleaning|airbnb-cleaning))?$/.test(path)
        || /^\/booking(?:\/(?:entry|quote|details|when|checkout|payment))?$/.test(path);
      if (publicRoute) out.pathname = path;
      else delete out.pathname;
    } catch { delete out.pathname; }
  }
  return out;
}

export type LiveBookingSectionRow = {
  step: string; section: string; label: string;
  viewedSessions: number; exitSessions: number; errorSessions: number;
};

export function buildLiveBookingSectionDiagnostics(rows: readonly {
  session_id: string; analytics_session_id?: string | null; step: string; event_type: string;
  metadata?: Record<string, unknown> | null;
}[]): LiveBookingSectionRow[] {
  const buckets = new Map<string, { row: LiveBookingSectionRow; views: Set<string>; exits: Set<string>; errors: Set<string> }>();
  for (const event of rows) {
    const metadata = event.metadata ?? {};
    if (metadata.service !== "regular-cleaning" || metadata.flow !== "booking_v2") continue;
    const wizardStep = event.step === "quote" ? 1 : event.step === "datetime" ? 2 : 0;
    const screen = SECTIONS[wizardStep]?.find((item) => item.key === metadata.section);
    if (!screen) continue;
    const id = event.analytics_session_id || (typeof metadata.analytics_session_id === "string" ? metadata.analytics_session_id : event.session_id);
    if (!id) continue;
    const key = event.step + ":" + screen.key;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { row: { step: event.step, section: screen.key, label: screen.label, viewedSessions: 0, exitSessions: 0, errorSessions: 0 },
        views: new Set(), exits: new Set(), errors: new Set() };
      buckets.set(key, bucket);
    }
    if (event.event_type === "view") bucket.views.add(id);
    if (event.event_type === "exit") bucket.exits.add(id);
    if (event.event_type === "error") bucket.errors.add(id);
  }
  return [1, 2].flatMap((step) => (SECTIONS[step] ?? []).flatMap((screen) => {
    const bucket = buckets.get((step === 1 ? "quote" : "datetime") + ":" + screen.key);
    if (!bucket) return [];
    return [{ ...bucket.row, viewedSessions: bucket.views.size, exitSessions: bucket.exits.size, errorSessions: bucket.errors.size }];
  }));
}
