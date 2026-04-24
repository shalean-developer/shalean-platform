import Link from "next/link";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { getLocationsByCity } from "@/lib/locations";
import { SERVICES } from "@/lib/services";

const waHref = "https://wa.me/27215550123?text=Hi%20Shalean%20Cleaning%20Services";

const footerServices = SERVICES.slice(0, 4).map((service) => ({
  label: service.name,
  href: `/services/${service.slug}`,
}));

const footerLocations = getLocationsByCity("cape-town").slice(0, 6);

export function FooterSection() {
  return (
    <footer id="contact" className="scroll-mt-28 border-t border-blue-100 bg-zinc-950 py-14 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-white">Shalean Cleaning Services</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Premium home cleaning across Cape Town. Book online, meet vetted pros, and enjoy dependable results.
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
            >
              WhatsApp us
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Services</p>
            <ul className="mt-3 space-y-2 text-sm">
              {footerServices.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-zinc-300 transition hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Locations</p>
            <ul className="mt-3 space-y-2 text-sm">
              {footerLocations.map((l) => (
                <li key={l.slug}>
                  <Link href={`/cleaning-services/${l.slug}`} className="text-zinc-300 transition hover:text-white">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Contact</p>
            <ul className="mt-3 space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                <a href="tel:+27215550123" className="transition hover:text-white">
                  +27 21 555 0123
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                <a href="mailto:hello@shaleancleaning.com" className="transition hover:text-white">
                  hello@shaleancleaning.com
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" aria-hidden />
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
          <p>© {new Date().getFullYear()} Shalean Cleaning Services. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/booking?step=entry" className="transition hover:text-zinc-300">
              Book now
            </Link>
            <Link href="/login?role=customer" className="transition hover:text-zinc-300">
              Customer login
            </Link>
            <a href="mailto:hello@shaleancleaning.com?subject=Privacy%20policy" className="transition hover:text-zinc-300">
              Privacy Policy
            </a>
            <a href="mailto:hello@shaleancleaning.com?subject=Terms%20of%20service" className="transition hover:text-zinc-300">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
