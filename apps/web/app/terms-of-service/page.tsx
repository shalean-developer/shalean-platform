import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Shalean Cleaning Services",
  description: "Terms of Service for Shalean Cleaning Services.",
  robots: { index: true, follow: true },
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-900">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-4 text-zinc-600">
        By booking with Shalean Cleaning Services, you agree to these terms. Our services are subject to availability,
        accurate booking details, and successful payment confirmation.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Bookings</h2>
      <p className="mt-3 text-zinc-600">
        Customers must provide accurate service addresses, access instructions, and cleaning requirements when booking.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Payments</h2>
      <p className="mt-3 text-zinc-600">
        Payments are processed securely through our payment providers. Booking totals are based on the selected service,
        property details, and add-ons.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p className="mt-3 text-zinc-600">
        For service questions, contact us at hello@shaleancleaning.com.
      </p>
    </main>
  );
}