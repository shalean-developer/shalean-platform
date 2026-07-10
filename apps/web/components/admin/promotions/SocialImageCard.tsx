"use client";

import { forwardRef } from "react";

/** Shalean campaign creative palette (navy + brand blue). */
export const SHALEAN_CAMPAIGN_PRIMARY = "#0B1F4A";
export const SHALEAN_CAMPAIGN_ACCENT = "#2563EB";
export const SHALEAN_CAMPAIGN_ACCENT_SOFT = "#60A5FA";

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

function isLegacyGreenAccent(color: string | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return c === "#059669" || c === "#34d399" || c === "#10b981" || c === "#047857";
}

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
      primary = SHALEAN_CAMPAIGN_PRIMARY,
      accent = SHALEAN_CAMPAIGN_ACCENT,
      previewMaxWidth = 320,
    },
    ref,
  ) {
    const scale = Math.min(1, previewMaxWidth / width);
    const isStory = height / width > 1.4;
    const isSquare = Math.abs(height / width - 1) < 0.08;
    const navy = isLegacyGreenAccent(primary) ? SHALEAN_CAMPAIGN_PRIMARY : primary || SHALEAN_CAMPAIGN_PRIMARY;
    const blue = isLegacyGreenAccent(accent) ? SHALEAN_CAMPAIGN_ACCENT : accent || SHALEAN_CAMPAIGN_ACCENT;
    const pad = isStory ? 80 : isSquare ? 64 : 56;
    const offerSize = isStory ? 88 : isSquare ? 64 : 58;
    const headlineSize = isStory ? 36 : isSquare ? 30 : 28;
    const bodySize = isStory ? 24 : 20;

    return (
      <div
        className="relative overflow-hidden rounded-lg shadow-sm ring-1 ring-slate-200/80"
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
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(155deg, ${navy} 0%, #123A7A 48%, ${blue} 100%)`,
            color: "#fff",
            fontFamily:
              '"Segoe UI", "Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif',
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: pad,
            boxSizing: "border-box",
          }}
        >
          {/* Soft light wash */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 80% 55% at 100% -10%, rgba(96,165,250,0.35) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at -10% 110%, rgba(255,255,255,0.08) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />
          {/* Corner frame accent */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: pad * 0.45,
              right: pad * 0.45,
              width: isStory ? 120 : 88,
              height: isStory ? 120 : 88,
              borderTop: `3px solid ${SHALEAN_CAMPAIGN_ACCENT_SOFT}`,
              borderRight: `3px solid ${SHALEAN_CAMPAIGN_ACCENT_SOFT}`,
              opacity: 0.55,
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: isStory ? 36 : 24,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: SHALEAN_CAMPAIGN_ACCENT_SOFT,
                  boxShadow: `0 0 0 4px rgba(96,165,250,0.25)`,
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: isStory ? 26 : 18,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  opacity: 0.92,
                }}
              >
                {brand}
              </p>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: Math.max(14, Math.round(offerSize * 0.28)),
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: SHALEAN_CAMPAIGN_ACCENT_SOFT,
              }}
            >
              Limited offer
            </p>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: offerSize,
                fontWeight: 800,
                lineHeight: 0.98,
                letterSpacing: "-0.03em",
              }}
            >
              {offer}
            </p>
            <p
              style={{
                margin: isStory ? "22px 0 0" : "16px 0 0",
                fontSize: headlineSize,
                fontWeight: 600,
                lineHeight: 1.25,
                maxWidth: "94%",
                letterSpacing: "-0.015em",
              }}
            >
              {headline}
            </p>
            {subheadline ? (
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: bodySize,
                  lineHeight: 1.4,
                  opacity: 0.88,
                  maxWidth: "90%",
                  fontWeight: 400,
                }}
              >
                {subheadline}
              </p>
            ) : null}
          </div>

          <div style={{ position: "relative", zIndex: 1, marginTop: isStory ? 40 : 28 }}>
            {promoCode ? (
              <p
                style={{
                  display: "inline-block",
                  margin: "0 0 20px",
                  padding: "12px 20px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: isStory ? 24 : 18,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                CODE {promoCode}
              </p>
            ) : null}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: isStory ? "16px 28px" : "14px 22px",
                borderRadius: 10,
                background: "#ffffff",
                color: navy,
                fontSize: isStory ? 24 : 18,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                boxShadow: "0 10px 28px rgba(11,31,74,0.28)",
              }}
            >
              {cta || "Book now"}
              <span style={{ color: blue, fontWeight: 800 }}>→</span>
            </div>
            <p
              style={{
                margin: "16px 0 0",
                fontSize: isStory ? 20 : 16,
                fontWeight: 500,
                opacity: 0.82,
                letterSpacing: "0.02em",
              }}
            >
              shalean.co.za
            </p>
          </div>
        </div>
      </div>
    );
  },
);
