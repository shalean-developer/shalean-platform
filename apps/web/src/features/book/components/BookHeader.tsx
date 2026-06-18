import Link from "next/link";
import type { BookFlowStep } from "@/src/features/book/bookFlowTypes";

type BookHeaderProps = {
  current: BookFlowStep;
};

export function BookHeader({ current }: BookHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white">
            ✋
          </div>

          <div className="leading-tight">
            <p className="text-xl font-bold text-slate-900">Shalean</p>
            <p className="text-xs font-semibold text-blue-500">
              Cleaning Services
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-10 md:flex">
          <Link href="/services" className="text-sm font-medium text-slate-600 hover:text-blue-600">
            Services
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-blue-600">
            Pricing
          </Link>
          <Link href="/contact" className="text-sm font-medium text-slate-600 hover:text-blue-600">
            Contact
          </Link>
          <Link href="/faq" className="text-sm font-medium text-slate-600 hover:text-blue-600">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:block"
          >
            Login
          </Link>

          <Link
            href="/book"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Book Now
          </Link>
        </div>
      </div>
    </header>
  );
}