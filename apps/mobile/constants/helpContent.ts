export type HelpArticle = {
  id: string;
  title: string;
  body: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "accept-jobs",
    title: "Accepting and starting jobs",
    body: "Open a job from Today or Schedule. Tap Accept, then On my way when you leave, Start when you arrive, and Complete when you finish. Always confirm access notes before you travel.",
  },
  {
    id: "photos",
    title: "Before and after photos",
    body: "Deep and move-out jobs may require photo proof. Use the Photos section on the job screen. If you are offline, uploads queue and sync when you reconnect.",
  },
  {
    id: "availability",
    title: "Availability",
    body: "Use the Available toggle on Today, Schedule, or Profile. When you are unavailable, you won’t receive new offers. Keep your roster hours up to date with ops if needed.",
  },
  {
    id: "earnings",
    title: "Earnings and payouts",
    body: "Earnings shows today, this week, and this month, plus pending and paid amounts. Payouts usually process on the company Friday schedule once jobs are eligible.",
  },
  {
    id: "offline",
    title: "Working offline",
    body: "Cached jobs stay visible offline. Lifecycle actions and photos queue until you are back online. Pull to refresh or use Sync when connectivity returns.",
  },
  {
    id: "support",
    title: "Getting help",
    body: "For access problems, safety, or payment issues, contact ops from Support via WhatsApp or phone. Use Send feedback for app suggestions, or Report an issue for serious concerns.",
  },
];

export const TRAINING_MODULES = [
  {
    id: "day-one",
    title: "Day one checklist",
    summary: "Sign in, set availability, review Today, and complete your first job lifecycle.",
  },
  {
    id: "quality",
    title: "Quality standards",
    summary: "Follow scope lines, extras, and access notes. Capture photos when required.",
  },
  {
    id: "reliability",
    title: "Reliability habits",
    summary: "Accept early, update On my way, and keep availability accurate for better offers.",
  },
] as const;
