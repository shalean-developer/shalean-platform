"use client";

import { MessageCircle } from "lucide-react";

const defaultHref = "https://wa.me/27215550123?text=Hi%20Shalean%2C%20I%27d%20like%20to%20book%20a%20cleaning.";

export function HomeWhatsAppFloat({ href = defaultHref }: { href?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 hover:shadow-xl md:bottom-6"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7" aria-hidden />
    </a>
  );
}
