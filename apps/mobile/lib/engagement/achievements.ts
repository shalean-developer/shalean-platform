import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@shalean/utils";
import { isJobCompleted } from "@/lib/jobs/jobDisplay";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  icon:
    | "sparkles-outline"
    | "star-outline"
    | "trophy-outline"
    | "ribbon-outline"
    | "thumbs-up-outline"
    | "flame-outline"
    | "flash-outline"
    | "layers-outline"
    | "people-outline"
    | "megaphone-outline";
  unlocked: boolean;
  progress?: { current: number; target: number };
};

export type EngagementStats = {
  jobsCompleted: number;
  rating: number | null;
  referralsCount: number;
  completedToday: number;
  completedThisWeek: number;
  streakDays: number;
  weekScheduled: number;
  weekCompletionRate: number | null;
};

/** Consecutive Johannesburg days (ending today) with ≥1 completed job. */
export function computeCompletionStreak(jobs: CleanerJobWire[], now = new Date()): number {
  const completedDates = new Set(
    jobs.filter(isJobCompleted).map((j) => String(j.date ?? "").trim()).filter(Boolean),
  );
  let streak = 0;
  let cursor = johannesburgCalendarYmd(now);
  for (let i = 0; i < 60; i++) {
    if (!completedDates.has(cursor)) break;
    streak += 1;
    cursor = johannesburgCalendarYmdAddDays(cursor, -1);
  }
  return streak;
}

export function buildEngagementStats(input: {
  jobs: CleanerJobWire[] | undefined;
  jobsCompleted?: number | null;
  rating?: number | null;
  referralsCount?: number | null;
  now?: Date;
}): EngagementStats {
  const now = input.now ?? new Date();
  const today = johannesburgCalendarYmd(now);
  const weekStart = johannesburgCalendarYmdAddDays(today, -6);
  const jobs = input.jobs ?? [];

  const completedToday = jobs.filter(
    (j) => isJobCompleted(j) && String(j.date ?? "").trim() === today,
  ).length;

  const weekJobs = jobs.filter((j) => {
    const d = String(j.date ?? "").trim();
    return d >= weekStart && d <= today;
  });
  const completedThisWeek = weekJobs.filter(isJobCompleted).length;
  const weekScheduled = weekJobs.length;
  const weekCompletionRate =
    weekScheduled > 0 ? Math.round((completedThisWeek / weekScheduled) * 100) : null;

  const jobsCompleted =
    typeof input.jobsCompleted === "number" && Number.isFinite(input.jobsCompleted)
      ? input.jobsCompleted
      : jobs.filter(isJobCompleted).length;

  return {
    jobsCompleted,
    rating: typeof input.rating === "number" ? input.rating : null,
    referralsCount: typeof input.referralsCount === "number" ? input.referralsCount : 0,
    completedToday,
    completedThisWeek,
    streakDays: computeCompletionStreak(jobs, now),
    weekScheduled,
    weekCompletionRate,
  };
}

export function deriveAchievements(stats: EngagementStats): AchievementDef[] {
  const { jobsCompleted, rating, referralsCount, completedToday, streakDays } = stats;

  return [
    {
      id: "first_job",
      title: "First clean",
      description: "Complete your first job",
      icon: "sparkles-outline",
      unlocked: jobsCompleted >= 1,
      progress: { current: Math.min(jobsCompleted, 1), target: 1 },
    },
    {
      id: "ten_jobs",
      title: "Rising star",
      description: "Complete 10 jobs",
      icon: "star-outline",
      unlocked: jobsCompleted >= 10,
      progress: { current: Math.min(jobsCompleted, 10), target: 10 },
    },
    {
      id: "fifty_jobs",
      title: "Pro cleaner",
      description: "Complete 50 jobs",
      icon: "trophy-outline",
      unlocked: jobsCompleted >= 50,
      progress: { current: Math.min(jobsCompleted, 50), target: 50 },
    },
    {
      id: "hundred_jobs",
      title: "Century club",
      description: "Complete 100 jobs",
      icon: "ribbon-outline",
      unlocked: jobsCompleted >= 100,
      progress: { current: Math.min(jobsCompleted, 100), target: 100 },
    },
    {
      id: "top_rated",
      title: "Highly rated",
      description: "Reach a 4.5+ rating",
      icon: "thumbs-up-outline",
      unlocked: rating != null && rating >= 4.5,
      progress:
        rating != null
          ? { current: Math.min(Math.round(rating * 10), 45), target: 45 }
          : { current: 0, target: 45 },
    },
    {
      id: "streak_3",
      title: "On a roll",
      description: "Complete jobs 3 days in a row",
      icon: "flame-outline",
      unlocked: streakDays >= 3,
      progress: { current: Math.min(streakDays, 3), target: 3 },
    },
    {
      id: "streak_7",
      title: "Week warrior",
      description: "Complete jobs 7 days in a row",
      icon: "flash-outline",
      unlocked: streakDays >= 7,
      progress: { current: Math.min(streakDays, 7), target: 7 },
    },
    {
      id: "triple_day",
      title: "Triple play",
      description: "Complete 3 jobs in one day",
      icon: "layers-outline",
      unlocked: completedToday >= 3,
      progress: { current: Math.min(completedToday, 3), target: 3 },
    },
    {
      id: "first_referral",
      title: "Team builder",
      description: "Refer a cleaner who joins",
      icon: "people-outline",
      unlocked: referralsCount >= 1,
      progress: { current: Math.min(referralsCount, 1), target: 1 },
    },
    {
      id: "five_referrals",
      title: "Ambassador",
      description: "Get 5 successful referrals",
      icon: "megaphone-outline",
      unlocked: referralsCount >= 5,
      progress: { current: Math.min(referralsCount, 5), target: 5 },
    },
  ];
}
