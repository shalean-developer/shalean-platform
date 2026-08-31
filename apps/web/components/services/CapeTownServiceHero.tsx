import type { ReactNode } from "react";
import Image from "next/image";
import styles from "./PrimaryCapeTownServicePageTemplate.module.css";

type Props = {
  copy: ReactNode;
  image: { src: string; alt: string };
  variant?: "legacy" | "primary";
};

/** Explicit hero contract shared by the Cape Town service-page renderer. */
export function CapeTownServiceHero({
  copy,
  image,
  variant = "legacy",
}: Props) {
  const primary = variant === "primary";

  return (
    <section
      className={
        primary
          ? styles.hero
          : "border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14"
      }
    >
      <div
        className={primary ? styles.heroContainer : "mx-auto max-w-7xl px-4"}
      >
        <div
          className={
            primary
              ? styles.heroGrid
              : "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-x-10"
          }
        >
          <div
            className={
              primary ? styles.heroCopy : "min-w-0 max-w-2xl lg:max-w-none"
            }
          >
            {copy}
          </div>
          <div
            className={
              primary
                ? styles.heroMedia
                : "relative aspect-[4/3] w-full min-h-0 min-w-0 overflow-hidden rounded-2xl shadow-lg"
            }
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className="z-0 object-cover"
              sizes="(max-width: 1024px) 100vw, (max-width: 1280px) 50vw, 704px"
              priority
              fetchPriority="high"
            />
            <div
              className={
                primary
                  ? styles.heroImageOverlay
                  : "pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-gradient-to-t from-black/20 to-transparent"
              }
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}
