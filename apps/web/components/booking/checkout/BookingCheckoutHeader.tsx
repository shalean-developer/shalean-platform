"use client";

import { Fragment, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOOKING_SEGMENT_INDEX, type BookingCheckoutSegment } from "@/lib/booking/bookingCheckoutGuards";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { signOut } from "@/lib/auth/authClient";

export type BookingCheckoutHeaderStepDef = {
  number: number;
  label: string;
};

/** Canonical checkout steps — drives the header stepper (length is dynamic). */
export const BOOKING_CHECKOUT_HEADER_STEPS = [
  { number: 1, label: "Details" },
  { number: 2, label: "Schedule" },
  { number: 3, label: "Worker" },
  { number: 4, label: "Payment" },
] as const satisfies readonly BookingCheckoutHeaderStepDef[];

export type BookingCheckoutHeaderStepIndex = 1 | 2 | 3 | 4;

export function bookingCheckoutHeaderStepFromSegment(segment: BookingCheckoutSegment): BookingCheckoutHeaderStepIndex {
  const i = BOOKING_SEGMENT_INDEX[segment];
  return (i + 1) as BookingCheckoutHeaderStepIndex;
}

function userDisplayInitials(user: User): string {
  const full = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0];
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
    return `${a ?? ""}${b ?? ""}`.toUpperCase() || "?";
  }
  const e = user.email?.trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return "?";
}

function avatarUrl(user: User): string | undefined {
  const u = user.user_metadata;
  if (!u || typeof u !== "object") return undefined;
  const raw = (u as Record<string, unknown>).avatar_url;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function BookingCheckoutHeaderStep({
  number,
  label,
  active,
  completed = false,
}: {
  number: number;
  label: string;
  active: boolean;
  completed?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 shrink-0 flex-col items-center text-center"
      aria-current={active ? "step" : undefined}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200",
          active && "bg-blue-600 text-white",
          completed && !active && "bg-green-500 text-white dark:bg-green-600",
          !active && !completed && "bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300",
        )}
      >
        {number}
      </div>
      <span
        className={cn(
          "mt-1 max-w-[4rem] truncate text-[10px] leading-tight text-gray-600 sm:max-w-[5.25rem] sm:text-[11px] md:max-w-none md:text-xs dark:text-zinc-400",
          active && "font-medium text-blue-900 dark:text-blue-200",
          completed && !active && "text-green-800 dark:text-green-300/90",
        )}
      >
        {label}
      </span>
    </div>
  );
}

type BookingCheckoutHeaderProps = {
  /** 1-based index of the active checkout step (must align with `BOOKING_CHECKOUT_HEADER_STEPS`). */
  currentStep: number;
};

export function BookingCheckoutHeader({ currentStep }: BookingCheckoutHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useUser();

  const stepCount = BOOKING_CHECKOUT_HEADER_STEPS.length;

  const safeStep = useMemo(() => {
    const n = Math.floor(Number(currentStep));
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > stepCount) return stepCount;
    return n;
  }, [currentStep, stepCount]);

  const path = pathname?.startsWith("/") ? pathname : "/booking/details";
  const redirectPath = `${path}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const authRedirect = encodeURIComponent(redirectPath);
  const photo = user ? avatarUrl(user) : undefined;

  return (
    <header className="sticky top-0 z-40 flex h-[60px] w-full items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative z-10 flex min-w-0 flex-1 items-center">
        <Link href="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-90">
          <Image
            src="/images/shalean-logo.png"
            alt="Shalean"
            width={120}
            height={32}
            className="h-6 w-auto shrink-0"
            priority
          />
          <span className="hidden font-semibold text-lg text-zinc-900 sm:inline dark:text-zinc-50">Shalean</span>
        </Link>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 max-w-[calc(100vw-10rem)] -translate-x-1/2 -translate-y-1/2 sm:max-w-[calc(100vw-14rem)] md:max-w-none">
        <nav
          className="pointer-events-auto flex items-start gap-0.5 sm:gap-1.5 md:gap-3 lg:gap-5"
          aria-label="Booking progress"
        >
          {BOOKING_CHECKOUT_HEADER_STEPS.map((step, index) => {
            const active = safeStep === step.number;
            const completed = safeStep > step.number;
            const showConnector = index < BOOKING_CHECKOUT_HEADER_STEPS.length - 1;
            const connectorComplete = safeStep > step.number;

            return (
              <Fragment key={step.number}>
                <BookingCheckoutHeaderStep
                  number={step.number}
                  label={step.label}
                  active={active}
                  completed={completed}
                />
                {showConnector ? (
                  <div
                    className={cn(
                      "mt-[calc(1rem-1px)] h-[2px] min-w-[2px] flex-1 max-w-[0.75rem] shrink rounded-full transition-colors duration-200 sm:max-w-[1.25rem] md:max-w-[2rem] lg:max-w-[2.5rem]",
                      connectorComplete ? "bg-green-500 dark:bg-green-600" : "bg-gray-200 dark:bg-zinc-700",
                    )}
                    aria-hidden
                  />
                ) : null}
              </Fragment>
            );
          })}
        </nav>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 justify-end">
        {loading ? (
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" aria-hidden />
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full outline-none ring-offset-2 ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-500 dark:ring-offset-zinc-950"
                aria-label="Account menu"
              >
                <Avatar className="h-8 w-8 border border-gray-200 dark:border-zinc-600">
                  {photo ? <AvatarImage src={photo} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="text-[11px]">{userDisplayInitials(user)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem] dark:border-zinc-700 dark:bg-zinc-900">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile" className="cursor-pointer">
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/bookings" className="cursor-pointer">
                  Bookings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-red-600 focus:text-red-600 dark:text-red-400"
                onSelect={async (e) => {
                  e.preventDefault();
                  await signOut();
                  router.refresh();
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1 border-gray-200 bg-white px-3 font-semibold text-zinc-900 shadow-none hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                <UserRound className="h-4 w-4 opacity-70" aria-hidden />
                Login
                <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem] dark:border-zinc-700 dark:bg-zinc-900">
              <DropdownMenuItem asChild>
                <Link href={`/auth/login?redirect=${authRedirect}`} className="cursor-pointer">
                  Login
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/auth/signup?redirect=${authRedirect}`} className="cursor-pointer">
                  Sign up
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

/** @deprecated Use `BookingCheckoutHeaderStep`. */
export const BookingCheckoutStep = BookingCheckoutHeaderStep;
