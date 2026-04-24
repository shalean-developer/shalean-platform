import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { GlobalTopNav } from "@/components/nav/GlobalTopNav";
import { ReferralCapture } from "@/components/referrals/ReferralCapture";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Shalean Cleaning Services",
    template: "%s | Shalean Cleaning Services",
  },
  description: "Book vetted home cleaners across Cape Town with instant pricing and secure online checkout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalTopNav />
        {children}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
      </body>
    </html>
  );
}
