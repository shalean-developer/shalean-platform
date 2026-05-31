import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Shalean Cleaning Services",
  description: "Privacy Policy for Shalean Cleaning Services.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-900">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-4 text-zinc-600">
        Shalean Cleaning Services respects your privacy. We collect only the information needed to process bookings,
        contact customers, manage payments, and provide cleaning services.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Information we collect</h2>
      <p className="mt-3 text-zinc-600">
        We may collect your name, phone number, email address, service address, booking details, payment reference, and
        communication history.
      </p>

      <h2 className="mt-8 text-xl font-semibold">How we use your information</h2>
      <p className="mt-3 text-zinc-600">
        We use your information to confirm bookings, assign cleaners, process payments, provide support, and improve our
        services.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p className="mt-3 text-zinc-600">
        For privacy questions, contact us at hello@shaleancleaning.com.
      </p>
    </main>
  );
}