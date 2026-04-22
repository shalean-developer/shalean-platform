export type CleanerTag = "top-rated" | "fast-efficient" | "deep-clean";

export type CleanerProfile = {
  id: string;
  name: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  jobsCompleted: number;
  yearsExperience: number;
  /** Single optional highlight */
  tag?: CleanerTag;
  /** Exactly one cleaner should be true — featured in Step 3 */
  recommended: boolean;
  /**
   * If set, only offered when `locked.time` is in this list.
   * `undefined` = available for any slot (still “filtered” client-side for UX).
   */
  availableSlots?: readonly string[] | null;
};

export const TAG_COPY: Record<CleanerTag, string> = {
  "top-rated": "Top rated",
  "fast-efficient": "Fast & efficient",
  "deep-clean": "Great for deep cleaning",
};

/** Demo roster — replace with API. */
export const CLEANERS: CleanerProfile[] = [
  {
    id: "cl_thandi",
    name: "Thandi M.",
    imageUrl: "https://i.pravatar.cc/128?img=47",
    rating: 4.9,
    reviewCount: 214,
    jobsCompleted: 520,
    yearsExperience: 6,
    tag: "top-rated",
    recommended: true,
    availableSlots: null,
  },
  {
    id: "cl_lerato",
    name: "Lerato K.",
    imageUrl: "https://i.pravatar.cc/128?img=32",
    rating: 4.8,
    reviewCount: 156,
    jobsCompleted: 380,
    yearsExperience: 4,
    tag: "fast-efficient",
    recommended: false,
    availableSlots: null,
  },
  {
    id: "cl_sipho",
    name: "Sipho N.",
    imageUrl: "https://i.pravatar.cc/128?img=12",
    rating: 4.9,
    reviewCount: 98,
    jobsCompleted: 240,
    yearsExperience: 5,
    tag: "deep-clean",
    recommended: false,
    availableSlots: null,
  },
  {
    id: "cl_amina",
    name: "Amina H.",
    imageUrl: "https://i.pravatar.cc/128?img=45",
    rating: 4.7,
    reviewCount: 132,
    jobsCompleted: 310,
    yearsExperience: 3,
    recommended: false,
    availableSlots: null,
  },
];

export function getCleanersAvailableForTime(time: string | null): CleanerProfile[] {
  if (!time) return [...CLEANERS];
  return CLEANERS.filter((c) => {
    if (c.availableSlots == null || c.availableSlots.length === 0) return true;
    return c.availableSlots.includes(time);
  });
}

export function getRecommendedCleaner(pool: CleanerProfile[]): CleanerProfile | null {
  const hit = pool.find((c) => c.recommended);
  return hit ?? pool[0] ?? null;
}
