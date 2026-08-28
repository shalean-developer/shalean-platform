"use client";

import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { trackGa4PhoneClick, trackGa4WhatsAppClick } from "@/lib/analytics/ga4Events";
import { SHALEAN_SOCIAL_LINKS } from "@/lib/brand/shaleanSocialLinks";
import { MARKETING_FOOTER_SERVICE_LINKS } from "@/lib/marketing/marketingServiceNavLinks";
import { customerSupportWhatsAppHref } from "@/lib/site/customerSupport";

const waHref = customerSupportWhatsAppHref();

const trackEvent = (eventName: "whatsapp_click" | "phone_click") => {
  if (eventName === "whatsapp_click") trackGa4WhatsAppClick();
  else trackGa4PhoneClick();
};

const FOOTER_SERVICES = [...MARKETING_FOOTER_SERVICE_LINKS];

const FOOTER_COMPANY = [
  { label: "About Us", href: "/about" },
  { label: "Areas We Serve", href: "/areas-we-serve" },
  { label: "Reviews", href: "/reviews" },
  { label: "Blog", href: "/blog" },
  { label: "Careers", href: "/cleaner/apply" },
  { label: "Contact", href: "/contact" },
];

const FOOTER_SUPPORT = [
  { label: "Get Free Quote", href: "/quote" },
  { label: "Help & FAQs", href: "/faq" },
  { label: "Booking & Payments", href: "/book" },
  { label: "Terms & Conditions", href: "/terms-of-service" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88V14.89h-2.54V12h2.54V9.8c0-2.51 1.49-3.89 3.77-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 16.99 22 12z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function SiteFooter({ stackFloats = false }: { stackFloats?: boolean }) {
  return (
    <>
      <footer id="contact" className="scroll-mt-28 bg-[#0d1b69] py-12 text-slate-300 sm:py-14">
        <PublicPageContainer>
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <div className="inline-flex rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
                <ShaleanNavLogo className="h-8 w-auto sm:h-9" intrinsicHeight={80} />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
                Reliable, professional cleaning services in Cape Town. We clean so you can live.
              </p>
              <div className="mt-5 flex items-center gap-3">
                {SHALEAN_SOCIAL_LINKS.map((link) => {
                  const Icon = link.id === "facebook" ? FacebookIcon : link.id === "instagram" ? InstagramIcon : WhatsAppIcon;
                  return (
                    <a
                      key={link.id}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Shalean on ${link.label}`}
                      onClick={link.id === "whatsapp" ? () => trackEvent("whatsapp_click") : undefined}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white sm:h-10 sm:w-10"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <FooterColumn title="Services" links={FOOTER_SERVICES} />
            <FooterColumn title="Company" links={FOOTER_COMPANY} />
            <FooterColumn title="Support" links={FOOTER_SUPPORT} />

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">Contact Us</p>
              <ul className="mt-4 space-y-2 text-sm sm:space-y-3">
                <li>
                  <a href="tel:0871535250" onClick={() => trackEvent("phone_click")} className="flex min-h-11 items-center gap-2 py-1 transition hover:text-white sm:min-h-0 sm:py-0">
                    <Phone className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                    087 153 5250
                  </a>
                </li>
                <li>
                  <a href="tel:0825915525" className="flex min-h-11 items-center gap-2 py-1 transition hover:text-white sm:min-h-0 sm:py-0">
                    <Phone className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                    082 591 5525
                  </a>
                </li>
                <li>
                  <a href="mailto:hello@shalean.co.za" className="flex min-h-11 items-center gap-2 py-1 transition hover:text-white sm:min-h-0 sm:py-0">
                    <Mail className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                    hello@shalean.co.za
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                  <span>Cape Town, South Africa</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-xs text-slate-500 sm:flex-row">
            <p>© {new Date().getFullYear()} Shalean Cleaning Services. All rights reserved.</p>
            <p>Built with ♥ for clean homes.</p>
          </div>
        </PublicPageContainer>
      </footer>

      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("whatsapp_click")}
        aria-label="Chat on WhatsApp"
        className={
          stackFloats
            ? "fixed bottom-[calc(5.25rem+2.75rem+0.5rem+env(safe-area-inset-bottom))] right-4 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-xl transition hover:scale-105 hover:bg-green-600 sm:right-6 md:bottom-[4.75rem]"
            : "fixed bottom-4 right-4 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-xl transition hover:scale-105 hover:bg-green-600 sm:bottom-6 sm:right-6"
        }
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </>
  );
}

function FooterColumn({ title, links }: { title: string; links: ReadonlyArray<{ label: string; href: string }> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">{title}</p>
      <ul className="mt-4 space-y-1 text-sm sm:space-y-2.5">
        {links.map(({ label, href }) => (
          <li key={label}>
            <Link href={href} className="block py-2 transition hover:text-white sm:py-0">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
