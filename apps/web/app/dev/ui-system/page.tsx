import type { Metadata } from "next";
import { FoundationScaleShowcase } from "./foundation-scale-showcase";
import { RDP01B5Showcase } from "./rd-p01b5-showcase";
import { RDP02PublicShellShowcase } from "./rd-p02-public-shell-showcase";
import { UISystemShowcase } from "./ui-system-showcase";

export const metadata: Metadata = {
  title: "Shalean UI System",
  description: "Development-only visual catalogue for the Shalean reusable UI system.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UISystemPage() {
  return (
    <>
      <RDP02PublicShellShowcase />
      <FoundationScaleShowcase />
      <RDP01B5Showcase />

      <section className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] pb-[var(--ui-space-12)]">
        <details className="rounded-[var(--ui-radius-xl)] border border-border bg-card p-[var(--ui-space-4)] text-card-foreground shadow-[var(--ui-shadow-sm)]">
          <summary className="cursor-pointer font-semibold">
            Historical RD-P00 baseline catalogue
          </summary>
          <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] text-muted-foreground">
            Archived audit evidence only. Status labels and planning language inside this section reflect the pre-approval RD-P00 snapshot and are not the current programme state.
          </p>
          <div className="mt-[var(--ui-space-4)] overflow-hidden rounded-[var(--ui-radius-lg)] border border-border">
            <UISystemShowcase />
          </div>
        </details>
      </section>
    </>
  );
}
