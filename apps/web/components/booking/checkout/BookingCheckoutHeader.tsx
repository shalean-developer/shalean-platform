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
import { BookingHistoryMobileSheet } from "@/components/booking/checkout/BookingHistoryMobileSheet";
import { BOOKING_SEGMENT_INDEX, type BookingCheckoutSegment } from "@/lib/booking/bookingCheckoutGuards";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { signOut } from "@/lib/auth/authClient";

export type BookingCheckoutHeaderStepDef = {
  number: number;
  label: string;
};

/** Canonical checkout steps — drives the header stepper (4 segments). */
export const BOOKING_CHECKOUT_HEADER_STEPS = [
  { number: 1, label: "Details" },
  { number: 2, label: "Schedule" },
  { number: 3, label: "Cleaner" },
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
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-xs font-semibold transition-colors duration-200",
          active && "border-blue-600 bg-blue-600 text-white dark:border-blue-600",
          completed &&
            !active &&
            "border-transparent bg-green-500 text-white dark:border-transparent dark:bg-green-600",
          !active &&
            !completed &&
            "border-gray-200 bg-white text-gray-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 lg:border-transparent lg:bg-gray-200 lg:text-gray-600 dark:lg:border-transparent dark:lg:bg-zinc-700 dark:lg:text-zinc-300",
        )}
        aria-label={`${label}, step ${number}`}
      >
        {number}
      </div>
      <span
        className={cn(
          "mt-1 hidden max-w-[4rem] truncate text-[10px] leading-tight text-gray-600 sm:max-w-[5.25rem] sm:text-[11px] md:max-w-none md:text-xs lg:block dark:text-zinc-400",
          active && "font-medium text-blue-900 dark:text-blue-200",
          completed && !active && "text-green-800 dark:text-green-300/90",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Mobile-only stepper: completed = green disc, active = blue disc, upcoming = plain numeral + gray connectors. */
function BookingCheckoutMobileFourStepRow({
  safeStep,
}: {
  safeStep: number;
}) {
  return (
    <nav className="flex min-w-0 flex-1 items-center justify-center gap-0" aria-label="Booking progress">
      {BOOKING_CHECKOUT_HEADER_STEPS.map((step, index) => {
        const n = step.number;
        const completed = safeStep > n;
        const active = safeStep === n;
        const upcoming = safeStep < n;
        const showConnector = index < BOOKING_CHECKOUT_HEADER_STEPS.length - 1;
        const connectorPassed = safeStep > n;

        return (
          <Fragment key={n}>
            <div className="flex shrink-0 items-center justify-center">
              {upcoming ? (
                <span
                  className="flex h-8 min-w-[1.25rem] items-center justify-center text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-100"
                  aria-label={`${step.label}, step ${n}, not started`}
                >
                  {n}
                </span>
              ) : (
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold tabular-nums text-white shadow-sm",
                    active && "bg-blue-600 dark:bg-blue-600",
                    completed && "bg-green-500 dark:bg-green-600",
                  )}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${step.label}, step ${n}${active ? ", current" : ", completed"}`}
                >
                  {n}
                </div>
              )}
            </div>
            {showConnector ? (
              <div
                className={cn(
                  "mx-0.5 h-[3px] min-w-[10px] flex-1 max-w-[2.25rem] rounded-full sm:max-w-[2.75rem]",
                  connectorPassed ? "bg-green-500 dark:bg-green-600" : "bg-gray-200 dark:bg-zinc-600",
                )}
                aria-hidden
              />
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );
}

function MobileBrandMark() {
  return (
    <Link
      href="/"
      className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blue-600 ring-2 ring-blue-500/30 transition-opacity hover:opacity-90"
      aria-label="Shalean home"
    >
      <Image
        src="/images/shalean-logo.png"
        alt=""
        fill
        className="object-contain p-1"
        sizes="36px"
        priority
      />
    </Link>
  );
}

type BookingCheckoutHeaderProps = {
  /** 1-based index for the 4-step stepper (1–4). */
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

  const logoBlock = (
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
  );

  const accountBlock = (mobileAvatar?: boolean) =>
    loading ? (
      <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" aria-hidden />
    ) : user ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full outline-none ring-offset-2 ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-500 dark:ring-offset-zinc-950"
            aria-label="Account menu"
          >
            <Avatar
              className={cn(
                "h-8 w-8 border border-gray-200 dark:border-zinc-600",
                mobileAvatar && "border-sky-200 dark:border-sky-800",
              )}
            >
              {photo ? <AvatarImage src={photo} alt="" className="object-cover" /> : null}
              <AvatarFallback
                className={cn(
                  "text-[11px] font-semibold",
                  mobileAvatar ? "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100" : undefined,
                )}
              >
                {userDisplayInitials(user)}
              </AvatarFallback>
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
            aria-label="Login or sign up"
            className="h-9 gap-1 border-gray-200 bg-white px-2 font-semibold text-zinc-900 shadow-none hover:bg-gray-50 sm:gap-1.5 sm:px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            <UserRound className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <span className="hidden sm:inline">Login</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem] dark:border-zinc-700 dark:bg-zinc-900">
          <DropdownMenuItem asChild>
            <Link href={`/auth?redirect=${authRedirect}`} className="cursor-pointer">
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
    );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Mobile: compact row (mark | 4-step | avatar) + Details */}
      <div className="flex flex-col lg:hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <MobileBrandMark />
          <BookingCheckoutMobileFourStepRow safeStep={safeStep} />
          {accountBlock(true)}
        </div>
        <BookingHistoryMobileSheet />
      </div>

      {/* Desktop */}
      <div className="hidden h-[60px] w-full items-center justify-between px-3 sm:px-6 lg:flex">
        <div className="relative z-10 flex min-w-0 flex-1 items-center">{logoBlock}</div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 max-w-[calc(100vw-8rem)] -translate-x-1/2 -translate-y-1/2 sm:max-w-[calc(100vw-14rem)] md:max-w-none">
          <nav
            className={cn(
              "pointer-events-auto flex gap-1 sm:gap-1.5 md:gap-3 lg:gap-5",
              "items-center lg:items-start",
            )}
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
                        "h-[2px] min-w-[4px] flex-1 max-w-[2rem] shrink rounded-full transition-colors duration-200 sm:max-w-[2.5rem] md:max-w-[2rem] lg:mt-[calc(1rem-1px)] lg:max-w-[2.5rem]",
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

        <div className="relative z-10 flex min-w-0 flex-1 justify-end">{accountBlock(false)}</div>
      </div>
    </header>
  );
}

/** @deprecated Use `BookingCheckoutHeaderStep`. */
export const BookingCheckoutStep = BookingCheckoutHeaderStep;
