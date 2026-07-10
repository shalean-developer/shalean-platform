"use client";

import { forwardRef } from "react";

export type SocialImageCardProps = {
  width: number;
  height: number;
  brand?: string;
  offer: string;
  headline: string;
  subheadline?: string | null;
  promoCode?: string | null;
  cta?: string | null;
  primary?: string;
  accent?: string;
  /** Scale down for on-screen preview (export uses full size via transform). */
  previewMaxWidth?: number;
};

/** Branded social creative — capture with html-to-image for PNG download / Facebook upload. */
export const SocialImageCard = forwardRef<HTMLDivElement, SocialImageCardProps>(
  function SocialImageCard(
    {
      width,
      height,
      brand = "Shalean",
      offer,
      headline,
      subheadline,
      promoCode,
      cta,
      primary = "#0f172a",
      accent = "#059669",
      previewMaxWidth = 320,
    },
    ref,
  ) {
    const scale = Math.min(1, previewMaxWidth / width);
    const isStory = height / width > 1.4;

    return (
      <div
        className="relative overflow-hidden"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          ref={ref}
          data-social-card
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: `linear-gradient(145deg, ${primary} 0%, ${accent} 100%)`,
            color: "#fff",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            display: "flex",
            flexDirection: "column",
            justifyContent: isStory ? "center" : "space-between",
            padding: isStory ? 72 : 56,
            boxSizing: "border-box",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: isStory ? 28 : 22,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.85,
                fontWeight: 600,
              }}
            >
              {brand}
            </p>
            <p
              style={{
                margin: isStory ? "28px 0 0" : "20px 0 0",
                fontSize: isStory ? 72 : 56,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {offer}
            </p>
            <p
              style={{
                margin: "18px 0 0",
                fontSize: isStory ? 40 : 32,
                fontWeight: 600,
                lineHeight: 1.2,
                maxWidth: "92%",
              }}
            >
              {headline}
            </p>
            {subheadline ? (
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: isStory ? 26 : 22,
                  lineHeight: 1.35,
                  opacity: 0.9,
                  maxWidth: "90%",
                }}
              >
                {subheadline}
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: isStory ? 48 : 0 }}>
            {promoCode ? (
              <p
                style={{
                  display: "inline-block",
                  margin: "0 0 18px",
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: isStory ? 26 : 22,
                  fontWeight: 700,
                }}
              >
                {promoCode}
              </p>
            ) : null}
            <p
              style={{
                margin: 0,
                fontSize: isStory ? 28 : 24,
                fontWeight: 700,
              }}
            >
              {cta || "Book now"} → shalean.co.za
            </p>
          </div>
        </div>
      </div>
    );
  },
);
