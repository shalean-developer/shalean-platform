import type { CSSProperties, ReactNode } from "react";
import { SOCIAL_HERO_IMAGES } from "./assets";
import type { SocialTrustItem } from "./types";
import {
  DEFAULT_BENEFITS,
  DEFAULT_TRUST_ITEMS,
  SHALEAN_CAMPAIGN_ACCENT_SOFT,
  SHALEAN_CAMPAIGN_STAR,
  SHALEAN_CAMPAIGN_WHITE,
  SOCIAL_FONT_STACK,
  SOCIAL_MONO_STACK,
  displayWebsite,
  formatCtaLabel,
  formatExpiryLabel,
} from "./tokens";

type LayerProps = {
  children: ReactNode;
  style?: CSSProperties;
  "data-layer"?: string;
};

/** Named layer wrapper so future GIF/MP4 export can target layers. */
export function Layer({ children, style, "data-layer": name }: LayerProps) {
  return (
    <div data-layer={name} style={{ position: "relative", zIndex: 1, ...style }}>
      {children}
    </div>
  );
}

export function HeroPhoto({
  src,
  alt = "Shalean cleaning",
  style,
  overlay,
}: {
  src: string;
  alt?: string;
  style?: CSSProperties;
  overlay?: string;
}) {
  return (
    <div
      data-layer="hero"
      style={{
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      {overlay ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: overlay,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}

export function BrandMark({
  brand,
  color = SHALEAN_CAMPAIGN_WHITE,
  size = 18,
  logoUrl,
  showLogo = true,
}: {
  brand: string;
  color?: string;
  size?: number;
  logoUrl?: string | null;
  showLogo?: boolean;
}) {
  const logo = logoUrl?.trim() || SOCIAL_HERO_IMAGES.logo;
  return (
    <div
      data-layer="brand"
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.55),
      }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          style={{
            width: Math.round(size * 1.55),
            height: Math.round(size * 1.55),
            objectFit: "contain",
            borderRadius: 6,
            background: "rgba(255,255,255,0.92)",
            padding: 3,
            boxShadow: "0 4px 14px rgba(11,31,74,0.18)",
          }}
        />      ) : (
        <span
          style={{
            width: Math.round(size * 0.55),
            height: Math.round(size * 0.55),
            borderRadius: 999,
            background: SHALEAN_CAMPAIGN_ACCENT_SOFT,
            boxShadow: "0 0 0 4px rgba(96,165,250,0.28)",
          }}
        />
      )}
      <span
        style={{
          fontFamily: SOCIAL_FONT_STACK,
          fontSize: size,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color,
          lineHeight: 1,
        }}
      >
        {brand}
      </span>
    </div>
  );
}

export function OfferBadge({
  label = "Limited offer",
  bg = "rgba(37,99,235,0.92)",
  color = "#fff",
  fontSize = 14,
}: {
  label?: string;
  bg?: string;
  color?: string;
  fontSize?: number;
}) {
  return (
    <span
      data-layer="badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: `${Math.round(fontSize * 0.45)}px ${Math.round(fontSize * 0.9)}px`,
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: SOCIAL_FONT_STACK,
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        boxShadow: "0 8px 24px rgba(11,31,74,0.22)",
      }}
    >
      {label}
    </span>
  );
}

export function OfferHeadline({
  offer,
  fontSize,
  color = "#fff",
  maxWidth = "100%",
}: {
  offer: string;
  fontSize: number;
  color?: string;
  maxWidth?: number | string;
}) {
  return (
    <p
      data-layer="offer"
      style={{
        margin: 0,
        fontFamily: SOCIAL_FONT_STACK,
        fontSize,
        fontWeight: 800,
        lineHeight: 0.95,
        letterSpacing: "-0.04em",
        color,
        maxWidth,
        textShadow: "0 6px 28px rgba(11,31,74,0.28)",
      }}
    >
      {offer}
    </p>
  );
}

export function BodyCopy({
  children,
  fontSize,
  color = "rgba(255,255,255,0.92)",
  weight = 500,
  maxWidth = "100%",
  style,
}: {
  children: ReactNode;
  fontSize: number;
  color?: string;
  weight?: number;
  maxWidth?: number | string;
  style?: CSSProperties;
}) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: SOCIAL_FONT_STACK,
        fontSize,
        fontWeight: weight,
        lineHeight: 1.3,
        letterSpacing: "-0.015em",
        color,
        maxWidth,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function BenefitsList({
  items = DEFAULT_BENEFITS,
  fontSize = 18,
  color = "#fff",
  gap = 10,
  columns = 1,
  tone = "light",
}: {
  items?: string[] | null;
  fontSize?: number;
  color?: string;
  gap?: number;
  columns?: 1 | 2;
  tone?: "light" | "dark";
}) {
  const list = (items?.length ? items : DEFAULT_BENEFITS).slice(0, 4);
  const chipBg = tone === "dark" ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.18)";
  const chipBorder = tone === "dark" ? "1px solid rgba(37,99,235,0.28)" : "1px solid rgba(255,255,255,0.35)";
  const chipColor = tone === "dark" ? "#2563EB" : color;

  return (
    <div
      data-layer="benefits"
      style={{
        display: "grid",
        gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
        gap,
      }}
    >
      {list.map((item) => (
        <div
          key={item}
          style={{
            display: "flex",
            alignItems: "center",
            gap: Math.round(fontSize * 0.45),
            fontFamily: SOCIAL_FONT_STACK,
            fontSize,
            fontWeight: 600,
            color,
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: Math.round(fontSize * 1.15),
              height: Math.round(fontSize * 1.15),
              borderRadius: 999,
              background: chipBg,
              border: chipBorder,
              color: chipColor,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.round(fontSize * 0.72),
              fontWeight: 800,
            }}
          >
            ✓
          </span>
          {item}
        </div>
      ))}
    </div>
  );
}

export function TrustRow({
  items,
  fontSize = 15,
  tone = "light",
}: {
  items?: SocialTrustItem[] | null;
  fontSize?: number;
  tone?: "light" | "dark" | "glass";
}) {
  const list = (items?.length ? items : DEFAULT_TRUST_ITEMS).slice(0, 3);
  const color = tone === "dark" ? "#0B1F4A" : "#fff";
  const chipBg =
    tone === "glass"
      ? "rgba(255,255,255,0.16)"
      : tone === "dark"
        ? "rgba(11,31,74,0.06)"
        : "rgba(255,255,255,0.14)";
  const border =
    tone === "dark" ? "1px solid rgba(11,31,74,0.1)" : "1px solid rgba(255,255,255,0.28)";

  return (
    <div
      data-layer="trust"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: Math.round(fontSize * 0.55),
      }}
    >
      {list.map((item) => (
        <span
          key={item.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.75)}px`,
            borderRadius: 999,
            background: chipBg,
            border,
            color,
            fontFamily: SOCIAL_FONT_STACK,
            fontSize,
            fontWeight: 700,
            backdropFilter: tone === "glass" ? "blur(10px)" : undefined,
          }}
        >
          <span style={{ color: item.icon === "★" ? SHALEAN_CAMPAIGN_STAR : undefined }}>
            {item.icon}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function PromoCodeChip({
  code,
  fontSize = 16,
  tone = "light",
}: {
  code: string;
  fontSize?: number;
  tone?: "light" | "dark";
}) {
  const light = tone === "light";
  return (
    <span
      data-layer="promo-code"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: `${Math.round(fontSize * 0.55)}px ${Math.round(fontSize * 0.95)}px`,
        borderRadius: 10,
        background: light ? "rgba(255,255,255,0.14)" : "rgba(37,99,235,0.1)",
        border: light ? "1px solid rgba(255,255,255,0.32)" : "1px dashed rgba(37,99,235,0.45)",
        color: light ? "#fff" : "#0B1F4A",
        fontFamily: SOCIAL_MONO_STACK,
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      CODE {code}
    </span>
  );
}

export function CtaButton({
  label,
  navy,
  blue,
  fontSize = 20,
  paddingY,
  paddingX,
  fullWidth = false,
}: {
  label: string;
  navy: string;
  blue: string;
  fontSize?: number;
  paddingY?: number;
  paddingX?: number;
  fullWidth?: boolean;
}) {
  return (
    <div
      data-layer="cta"
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.round(fontSize * 0.45),
        padding: `${paddingY ?? Math.round(fontSize * 0.7)}px ${paddingX ?? Math.round(fontSize * 1.25)}px`,
        borderRadius: Math.round(fontSize * 0.55),
        background: `linear-gradient(180deg, ${SHALEAN_CAMPAIGN_WHITE} 0%, #F8FAFC 100%)`,
        color: navy,
        fontFamily: SOCIAL_FONT_STACK,
        fontSize,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        boxShadow: `0 14px 36px rgba(11,31,74,0.32), 0 0 0 1px rgba(255,255,255,0.4)`,
        width: fullWidth ? "100%" : undefined,
        boxSizing: "border-box",
      }}
    >
      {formatCtaLabel(label)}
      <span
        style={{
          color: blue,
          fontSize: Math.round(fontSize * 1.05),
          lineHeight: 1,
        }}
      >
        →
      </span>
    </div>
  );
}

export function FooterBrand({
  landing,
  fontSize = 15,
  color = "rgba(255,255,255,0.85)",
  endsAt,
}: {
  landing?: string | null;
  fontSize?: number;
  color?: string;
  endsAt?: string | null;
}) {
  const expiry = formatExpiryLabel(endsAt);
  return (
    <div
      data-layer="footer"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        fontFamily: SOCIAL_FONT_STACK,
        fontSize,
        fontWeight: 600,
        color,
        letterSpacing: "0.02em",
      }}
    >
      <span>{displayWebsite(landing)}</span>
      {expiry ? <span style={{ opacity: 0.9 }}>{expiry}</span> : null}
    </div>
  );
}

export function GlassCard({
  children,
  style,
  padding = 28,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div
      data-layer="offer-card"
      style={{
        background: "rgba(11,31,74,0.72)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.22)",
        borderRadius: 24,
        padding,
        boxShadow: "0 24px 60px rgba(11,31,74,0.35)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SoftPanel({
  children,
  style,
  padding = 28,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(165deg, #FFFFFF 0%, #F1F5F9 100%)",
        borderRadius: 22,
        padding,
        boxShadow: "0 18px 48px rgba(11,31,74,0.14)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function GradientWash({ navy, blue }: { navy: string; blue: string }) {
  return (
    <div
      aria-hidden
      data-layer="wash"
      style={{
        position: "absolute",
        inset: 0,
        background: `
          radial-gradient(ellipse 70% 55% at 100% 0%, rgba(96,165,250,0.38) 0%, transparent 55%),
          radial-gradient(ellipse 55% 45% at 0% 100%, rgba(255,255,255,0.1) 0%, transparent 50%),
          linear-gradient(145deg, ${navy} 0%, #123A7A 46%, ${blue} 100%)
        `,
        pointerEvents: "none",
      }}
    />
  );
}
