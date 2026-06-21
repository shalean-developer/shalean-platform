import Link from "next/link";
import { CheckCircle2, MessageCircle, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import {
  CLEANER_APPLY_FORM_PATH,
  CLEANER_APPLY_REQUIREMENTS,
  CLEANER_APPLY_STATS,
  CLEANER_APPLY_TESTIMONIALS,
  CLEANER_APPLY_WHY_JOIN,
  CLEANER_APPLY_WORK_TYPES,
} from "@/lib/cleaner/applyPageContent";
import { CleanerApplyHeader } from "./CleanerApplyHeader";

export function CleanerApplyLanding() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900">
      <CleanerApplyHeader showApplyCta />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Join our team
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Why become a Shalean cleaner?
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Work with a professional cleaning company trusted across Cape Town. Get regular jobs, choose your
            schedule, and earn weekly — apply on your phone in under two minutes.
          </p>
          <ul className="mx-auto mt-6 flex max-w-2xl flex-col gap-3 text-left sm:grid sm:grid-cols-2">
            {CLEANER_APPLY_WHY_JOIN.map(({ Icon, text }) => (
              <li
                key={text}
                className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                  <Icon className="h-4 w-4 text-blue-600" strokeWidth={2} aria-hidden />
                </div>
                <span className="text-sm font-medium text-slate-800">{text}</span>
              </li>
            ))}
          </ul>
          <Link
            href={CLEANER_APPLY_FORM_PATH}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Start your application
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          {CLEANER_APPLY_STATS.map(({ value, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-blue-100 bg-blue-600 px-5 py-4 text-center shadow-sm sm:py-5"
            >
              <p className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">{value}</p>
              <p className="mt-1 text-xs font-medium text-blue-100 sm:text-sm">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-center text-2xl font-bold text-slate-900">Types of work you can do</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600">
            Shalean cleaners work on homes, Airbnb turnovers, offices, and specialist deep cleans. Tell us your
            experience when you apply — we match you to suitable jobs.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CLEANER_APPLY_WORK_TYPES.map(({ Icon, title, desc, tasks }) => (
              <article
                key={title}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <Icon className="h-5 w-5 text-blue-600" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{desc}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
                  {tasks.map((task) => (
                    <li key={task} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />
                      {task}
                    </li>
                  ))}
                </ul>
                <Link
                  href={CLEANER_APPLY_FORM_PATH}
                  className="mt-5 flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  Apply for this work
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">To join Shalean you need:</h2>
          <ul className="mt-4 space-y-3">
            {CLEANER_APPLY_REQUIREMENTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <MessageCircle className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
            Please use the{" "}
            <Link href={CLEANER_APPLY_FORM_PATH} className="font-semibold text-blue-600 hover:underline">
              online application form
            </Link>
            — we review applications online, not via social media.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-center text-2xl font-bold text-slate-900">Cleaner stories</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {CLEANER_APPLY_TESTIMONIALS.map(({ quote, name, area }) => (
              <blockquote key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm leading-relaxed text-slate-700">&ldquo;{quote}&rdquo;</p>
                <footer className="mt-4 text-xs font-semibold text-slate-900">
                  {name}
                  <span className="font-normal text-slate-500"> · {area}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-blue-200 bg-blue-600 p-8 text-center shadow-sm sm:p-10">
          <h2 className="text-2xl font-bold text-white">Ready to apply?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-blue-100">
            The application takes about two minutes. We&apos;ll review your details and contact you on WhatsApp.
          </p>
          <Link
            href={CLEANER_APPLY_FORM_PATH}
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-8 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            Go to application form
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <p className="mt-10 text-center">
          <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">
            Back to home page
          </Link>
        </p>
      </main>
    </div>
  );
}
