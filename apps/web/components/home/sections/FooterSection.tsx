"use client";

import Link from "next/link";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { locationPageServiceLinks } from "@/lib/seo/capeTownSeoPages";
import { PopularCapeTownStrip } from "@/components/seo/PopularCapeTownStrip";
import { FOOTER_POPULAR_LOCATION_HUBS } from "@/lib/seo/locations";

const waHref =
  "https://wa.me/27825915525?text=Hi%20Shalean%20Cleaning%20Services";

const footerServices = locationPageServiceLinks();

const trackEvent = (eventName: string) => {
  if (
    typeof window !== "undefined" &&
    typeof (window as any).gtag === "function"
  ) {
    (window as any).gtag("event", eventName);
  }
};

export function FooterSection() {
  return (
    <>
      <footer
        id="contact"
        className="scroll-mt-28 border-t border-blue-100 bg-zinc-950 py-14 text-zinc-100"
      >
        <div className="mx-auto max-w-7xl px-4">
          <PopularCapeTownStrip theme="zinc" className="mb-10" />

          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-lg font-bold text-white">
                Shalean Cleaning Services
              </p>

              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Premium home cleaning across Cape Town. Book online, meet vetted
                pros, and enjoy dependable results.
              </p>

              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("whatsapp_click")}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
              >
                WhatsApp us
              </a>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                Services
              </p>

              <ul className="mt-3 space-y-2 text-sm">
                {footerServices.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-zinc-300 transition hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                Popular Areas
              </p>

              <nav aria-label="Popular Cape Town cleaning locations">
                <ul className="mt-3 space-y-2 text-sm">
                  {FOOTER_POPULAR_LOCATION_HUBS.map((hub) => (
                    <li key={hub.slug}>
                      <Link
                        href={`/locations/${hub.slug}`}
                        className="text-zinc-300 transition hover:text-white"
                      >
                        {hub.name}
                      </Link>
                    </li>
                  ))}

                  <li className="pt-1">
                    <Link
                      href="/locations"
                      className="font-medium text-blue-400 transition hover:text-white"
                    >
                      View all locations
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                Contact
              </p>

              <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                <li className="flex items-start gap-2">
                  <Phone
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                    aria-hidden
                  />
                  <a
                    href="tel:+27871535250"
                    onClick={() => trackEvent("phone_click")}
                    className="transition hover:text-white"
                  >
                    +27 87 153 5250
                  </a>
                </li>

                <li className="flex items-start gap-2">
                  <Mail
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                    aria-hidden
                  />
                  <a
                    href="mailto:hello@shaleancleaning.com"
                    className="transition hover:text-white"
                  >
                    hello@shaleancleaning.com
                  </a>
                </li>

                <li className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                    aria-hidden
                  />
                  <span>Cape Town &amp; surrounds</span>
                </li>
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="https://www.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-blue-400 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Facebook
                </a>

                <a
                  href="https://www.instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-blue-400 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Instagram
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-zinc-800 pt-8 text-xs text-zinc-500 sm:flex-row">
            <p>
              © {new Date().getFullYear()} Shalean Cleaning Services. All rights
              reserved.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/booking/details"
                className="transition hover:text-zinc-300"
              >
                Book now
              </Link>

              <Link href="/auth" className="transition hover:text-zinc-300">
                Sign in
              </Link>

              <Link
                href="/privacy-policy"
                className="transition hover:text-zinc-300"
              >
                Privacy Policy
              </Link>

              <Link
                href="/terms-of-service"
                className="transition hover:text-zinc-300"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("whatsapp_click")}
        aria-label="Chat on WhatsApp"
        className="fixed bottom-6 right-6 z-[9999] flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-xl transition hover:scale-105 hover:bg-green-600"
      >
        <svg
          viewBox="0 0 32 32"
          className="h-8 w-8 fill-current"
          aria-hidden="true"
        >
          <path d="M16.04 3C8.84 3 3 8.73 3 15.8c0 2.49.73 4.92 2.1 7L3 29l6.42-2.03a13.2 13.2 0 006.62 1.8c7.2 0 13.04-5.73 13.04-12.8C29.08 8.73 23.24 3 16.04 3zm0 23.46c-2.02 0-3.99-.54-5.7-1.57l-.41-.24-3.81 1.2 1.24-3.68-.27-.42a10.8 10.8 0 01-1.68-5.75c0-5.92 4.78-10.73 10.63-10.73 5.86 0 10.64 4.81 10.64 10.73s-4.78 10.46-10.64 10.46z" />
        </svg>
      </a>
    </>
  );
}