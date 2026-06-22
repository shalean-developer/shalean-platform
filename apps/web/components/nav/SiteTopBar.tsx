import type React from "react";
import { Clock, Mail, MapPin, Phone, Shield } from "lucide-react";
import { SiteTopBarAccount } from "@/components/nav/SiteTopBarAccount";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";
import { SHALEAN_SOCIAL_LINKS } from "@/lib/brand/shaleanSocialLinks";

type ContactItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
};

const CONTACT_ITEMS: ContactItem[] = [
  { icon: Shield, label: "No hidden fees, ever" },
  { icon: Clock, label: "8am – 6pm (Mon - Sat)" },
  { icon: Phone, label: CUSTOMER_SUPPORT_TELEPHONE_DISPLAY, href: CUSTOMER_SUPPORT_TELEPHONE_TEL },
  { icon: MapPin, label: "Cape Town, South Africa" },
  { icon: Mail, label: "hello@shalean.co.za", href: "mailto:hello@shalean.co.za" },
];

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.563 9.872v-6.982H7.898V12h2.539V9.797c0-2.507 1.493-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.772-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.982A10.003 10.003 0 0 0 22 12Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const SOCIAL_ICON_BY_ID = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  whatsapp: WhatsAppIcon,
} as const;

export function SiteTopBar() {
  return (
    <div className="bg-gradient-to-r from-[#0d1b69] to-[#1a3dbd]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-none md:gap-6">
          {CONTACT_ITEMS.map(({ icon: Icon, label, href }) => {
            const content = (
              <>
                <Icon className="h-3.5 w-3.5 shrink-0 text-white/70" />
                <span className="whitespace-nowrap text-xs text-white/90">{label}</span>
              </>
            );
            if (href) {
              return (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
                >
                  {content}
                </a>
              );
            }
            return (
              <span key={label} className="flex items-center gap-1.5">
                {content}
              </span>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <SiteTopBarAccount />
          {SHALEAN_SOCIAL_LINKS.map((link) => {
            const Icon = SOCIAL_ICON_BY_ID[link.id];
            return (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="text-white/80 transition-colors hover:text-white"
              >
                <Icon />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
