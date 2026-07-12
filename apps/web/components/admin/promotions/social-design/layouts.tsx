import { resolveHeroImage, resolveSecondaryImage } from "./assets";
import {
  BenefitsList,
  BodyCopy,
  BrandMark,
  CtaButton,
  FooterBrand,
  HeroPhoto,
  Layer,
  OfferBadge,
  OfferHeadline,
  PromoCodeChip,
  SoftPanel,
  TrustRow,
} from "./primitives";
import type { SocialLayoutProps } from "./types";
import { scaleType } from "./tokens";


/** Facebook / landscape: full-bleed hero, content left, photo visible right. */
export function LayoutFacebook(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const offerSize = scaleType(70, p.offer, 12, 18);

  return (
    <>
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(100deg, rgba(11,31,74,0.96) 0%, rgba(11,31,74,0.88) 38%, rgba(11,31,74,0.45) 58%, rgba(11,31,74,0.12) 78%, transparent 100%)"
      />
      {/* Soft accent orb so the open photo side still feels designed */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -40,
          top: -60,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.35) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 44px",
          boxSizing: "border-box",
          width: "58%",
          maxWidth: 680,
        }}
      >
        <Layer data-layer="content-top">
          <BrandMark brand={p.brand} size={16} logoUrl={p.logoUrl} />
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <OfferBadge label={p.badgeLabel || "Limited offer"} fontSize={12} />
            <TrustRow
              tone="glass"
              fontSize={13}
              items={(p.trustItems ?? []).slice(0, 1).length ? (p.trustItems ?? []).slice(0, 1) : [{ icon: "★", label: "4.9 Rating" }]}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <OfferHeadline offer={p.offer} fontSize={offerSize} />
          </div>
          <div style={{ marginTop: 12 }}>
            <BodyCopy fontSize={24} weight={700} maxWidth="100%">
              {p.headline}
            </BodyCopy>
          </div>
          {p.subheadline ? (
            <div style={{ marginTop: 8 }}>
              <BodyCopy fontSize={16} color="rgba(255,255,255,0.88)" maxWidth="95%">
                {p.subheadline}
              </BodyCopy>
            </div>
          ) : null}
        </Layer>

        <Layer data-layer="content-bottom">
          <BenefitsList fontSize={15} gap={8} />
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <CtaButton label={p.cta || "Book Now"} navy={p.navy} blue={p.blue} fontSize={18} />
            {p.promoCode ? <PromoCodeChip code={p.promoCode} fontSize={13} /> : null}
          </div>
          <div style={{ marginTop: 12 }}>
            <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={13} />
          </div>
        </Layer>
      </div>

      {/* Compact photo-side caption — no empty glass panel */}
      <div
        data-layer="photo-caption"
        style={{
          position: "absolute",
          right: 36,
          bottom: 36,
          zIndex: 2,
          maxWidth: 340,
          padding: "14px 18px",
          borderRadius: 16,
          background: "rgba(11,31,74,0.78)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 16px 40px rgba(11,31,74,0.35)",
          backdropFilter: "blur(12px)",
        }}
      >
        <BodyCopy fontSize={14} weight={700} color="#fff">
          Sparkling Cape Town homes, booked in minutes.
        </BodyCopy>
        <div style={{ marginTop: 8 }}>
          <BodyCopy fontSize={12} color="rgba(255,255,255,0.82)">
            Vetted cleaners · Fully insured · Secure online booking
          </BodyCopy>
        </div>
      </div>
    </>
  );
}

/** Instagram feed: square, high-impact, minimal copy. */
export function LayoutInstagramFeed(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const offerSize = scaleType(96, p.offer, 12, 18);

  return (
    <>
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(180deg, rgba(11,31,74,0.35) 0%, rgba(11,31,74,0.2) 35%, rgba(11,31,74,0.88) 72%, #0B1F4A 100%)"
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <BrandMark brand={p.brand} size={18} logoUrl={p.logoUrl} />
          <OfferBadge label={p.badgeLabel || "New customers"} fontSize={13} />
        </div>
        <div style={{ textAlign: "left" }}>
          <OfferHeadline offer={p.offer} fontSize={offerSize} />
          <div style={{ marginTop: 18 }}>
            <BodyCopy fontSize={34} weight={700} maxWidth="90%">
              {p.headline}
            </BodyCopy>
          </div>
          <div style={{ marginTop: 22 }}>
            <TrustRow tone="glass" fontSize={15} items={p.trustItems} />
          </div>
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <CtaButton label={p.cta || "Book Now"} navy={p.navy} blue={p.blue} fontSize={22} />
            {p.promoCode ? <PromoCodeChip code={p.promoCode} fontSize={15} /> : null}
          </div>
          <div style={{ marginTop: 18 }}>
            <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={16} />
          </div>
        </div>
      </div>
    </>
  );
}

/** Stories / WhatsApp: full-bleed vertical with large CTA. */
export function LayoutStory(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const isWhatsApp = p.format === "whatsapp_status";
  const offerSize = scaleType(isWhatsApp ? 100 : 110, p.offer, 12, 18);
  const safeTop = 96;
  const safeBottom = 120;

  return (
    <>
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(180deg, rgba(11,31,74,0.55) 0%, rgba(11,31,74,0.25) 28%, rgba(11,31,74,0.55) 55%, rgba(11,31,74,0.95) 100%)"
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${safeTop}px 56px ${safeBottom}px`,
          boxSizing: "border-box",
        }}
      >
        <div>
          <BrandMark brand={p.brand} size={22} logoUrl={p.logoUrl} />
          <div style={{ marginTop: 36 }}>
            <OfferBadge label={p.badgeLabel || "Limited offer"} fontSize={16} />
          </div>
        </div>

        <div>
          <OfferHeadline offer={p.offer} fontSize={offerSize} />
          <div style={{ marginTop: 24 }}>
            <BodyCopy fontSize={40} weight={700} maxWidth="95%">
              {p.headline}
            </BodyCopy>
          </div>
          {p.subheadline ? (
            <div style={{ marginTop: 16 }}>
              <BodyCopy fontSize={24} color="rgba(255,255,255,0.9)" maxWidth="92%">
                {p.subheadline}
              </BodyCopy>
            </div>
          ) : null}
          <div style={{ marginTop: 28 }}>
            <BenefitsList fontSize={22} gap={14} />
          </div>
        </div>

        <div>
          <TrustRow tone="glass" fontSize={18} items={p.trustItems} />
          {p.promoCode ? (
            <div style={{ marginTop: 20 }}>
              <PromoCodeChip code={p.promoCode} fontSize={20} />
            </div>
          ) : null}
          <div style={{ marginTop: 28 }}>
            <CtaButton
              label={p.cta || "Book Now"}
              navy={p.navy}
              blue={p.blue}
              fontSize={28}
              fullWidth
              paddingY={22}
            />
          </div>
          <div
            style={{
              marginTop: 16,
              textAlign: "center",
              fontFamily: "inherit",
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {isWhatsApp ? "Tap to book" : "Swipe up to book"}
          </div>
          <div style={{ marginTop: 18 }}>
            <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={18} />
          </div>
        </div>
      </div>
    </>
  );
}

/** LinkedIn: professional overlapping panel — no empty mid-column. */
export function LayoutLinkedIn(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const secondary = resolveSecondaryImage(p.format ?? undefined);
  const offerSize = scaleType(56, p.offer, 12, 18);

  return (
    <>
      {/* Full-bleed lifestyle photo */}
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(105deg, rgba(248,250,252,0.98) 0%, rgba(248,250,252,0.94) 42%, rgba(248,250,252,0.35) 62%, rgba(11,31,74,0.2) 100%)"
      />

      {/* Navy accent strip */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          background: `linear-gradient(180deg, ${p.blue} 0%, ${p.navy} 100%)`,
          zIndex: 2,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 20,
          padding: "36px 36px 36px 44px",
          boxSizing: "border-box",
        }}
      >
        <SoftPanel
          padding={28}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(11,31,74,0.08)",
            boxShadow: "0 20px 48px rgba(11,31,74,0.12)",
            minWidth: 0,
          }}
        >
          <div>
            <BrandMark brand={p.brand} size={14} color={p.navy} logoUrl={p.logoUrl} />
            <div style={{ marginTop: 18 }}>
              <BodyCopy
                fontSize={12}
                color={p.blue}
                weight={700}
                style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                {p.badgeLabel || "Professional cleaning"}
              </BodyCopy>
            </div>
            <div style={{ marginTop: 10 }}>
              <OfferHeadline offer={p.offer} fontSize={offerSize} color={p.navy} />
            </div>
            <div style={{ marginTop: 10 }}>
              <BodyCopy fontSize={22} weight={700} color={p.navy} maxWidth="100%">
                {p.headline}
              </BodyCopy>
            </div>
            {p.subheadline ? (
              <div style={{ marginTop: 8 }}>
                <BodyCopy fontSize={15} color="#475569" maxWidth="100%">
                  {p.subheadline}
                </BodyCopy>
              </div>
            ) : null}

            {/* Mid-column fill: benefits (was empty before) */}
            <div style={{ marginTop: 18 }}>
              <BenefitsList
                fontSize={14}
                gap={8}
                color={p.navy}
                tone="dark"
                items={p.benefits ?? ["Trusted Cleaners", "Fully Insured", "Easy Online Booking"]}
              />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <TrustRow tone="dark" fontSize={12} items={p.trustItems} />
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <CtaButton label={p.cta || "Schedule Today"} navy={p.navy} blue={p.blue} fontSize={16} />
              {p.promoCode ? <PromoCodeChip code={p.promoCode} fontSize={12} tone="dark" /> : null}
            </div>
            <div style={{ marginTop: 12 }}>
              <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={12} color="#64748B" />
            </div>
          </div>
        </SoftPanel>

        {/* Right column: stacked lifestyle frames — fills the photo side */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minWidth: 0,
            height: "100%",
          }}
        >
          <HeroPhoto
            src={hero}
            style={{
              flex: 1.35,
              borderRadius: 18,
              boxShadow: "0 18px 40px rgba(11,31,74,0.18)",
              border: "1px solid rgba(255,255,255,0.65)",
            }}
            overlay="linear-gradient(180deg, transparent 55%, rgba(11,31,74,0.35) 100%)"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              flex: 0.85,
              minHeight: 0,
            }}
          >
            <HeroPhoto
              src={secondary}
              style={{
                borderRadius: 14,
                boxShadow: "0 12px 28px rgba(11,31,74,0.14)",
              }}
            />
            <div
              style={{
                borderRadius: 14,
                background: `linear-gradient(160deg, ${p.navy} 0%, ${p.blue} 100%)`,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                boxShadow: "0 12px 28px rgba(11,31,74,0.2)",
                boxSizing: "border-box",
              }}
            >
              <BodyCopy fontSize={12} color="rgba(255,255,255,0.8)" weight={700} style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Cape Town
              </BodyCopy>
              <BodyCopy fontSize={20} color="#fff" weight={800} style={{ marginTop: 6 }}>
                Homes & offices
              </BodyCopy>
              <BodyCopy fontSize={13} color="rgba(255,255,255,0.85)" style={{ marginTop: 8 }}>
                Book online in minutes
              </BodyCopy>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** X / Twitter: minimal timeline creative. */
export function LayoutTwitter(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const offerSize = scaleType(78, p.offer, 12, 18);

  return (
    <>
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(100deg, rgba(11,31,74,0.94) 0%, rgba(11,31,74,0.78) 48%, rgba(37,99,235,0.45) 100%)"
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 56px",
          boxSizing: "border-box",
          maxWidth: "72%",
        }}
      >
        <BrandMark brand={p.brand} size={15} logoUrl={p.logoUrl} />
        <div style={{ marginTop: 28 }}>
          <OfferHeadline offer={p.offer} fontSize={offerSize} />
        </div>
        <div style={{ marginTop: 16 }}>
          <BodyCopy fontSize={28} weight={700} maxWidth="100%">
            {p.headline}
          </BodyCopy>
        </div>
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <CtaButton label={p.cta || "Book Now"} navy={p.navy} blue={p.blue} fontSize={20} />
          {p.promoCode ? <PromoCodeChip code={p.promoCode} fontSize={14} /> : null}
        </div>
        <div style={{ marginTop: 20 }}>
          <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={14} />
        </div>
      </div>
    </>
  );
}

/** Pinterest: tall magazine-style stack. */
export function LayoutPinterest(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const secondary = resolveSecondaryImage(p.format ?? undefined);
  const offerSize = scaleType(84, p.offer, 12, 18);

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${p.navy} 0%, #123A7A 100%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        <HeroPhoto
          src={hero}
          style={{ height: "42%", flexShrink: 0 }}
          overlay="linear-gradient(180deg, rgba(11,31,74,0.15) 0%, rgba(11,31,74,0.55) 100%)"
        />
        <div style={{ padding: "36px 40px 28px", flex: 1, display: "flex", flexDirection: "column" }}>
          <BrandMark brand={p.brand} size={16} logoUrl={p.logoUrl} />
          <div style={{ marginTop: 20 }}>
            <OfferBadge label={p.badgeLabel || "Limited offer"} fontSize={13} />
          </div>
          <div style={{ marginTop: 16 }}>
            <OfferHeadline offer={p.offer} fontSize={offerSize} />
          </div>
          <div style={{ marginTop: 14 }}>
            <BodyCopy fontSize={30} weight={700}>
              {p.headline}
            </BodyCopy>
          </div>
          {p.subheadline ? (
            <div style={{ marginTop: 12 }}>
              <BodyCopy fontSize={18} color="rgba(255,255,255,0.88)">
                {p.subheadline}
              </BodyCopy>
            </div>
          ) : null}
          <div style={{ marginTop: 22 }}>
            <BenefitsList fontSize={17} gap={10} />
          </div>
          <div style={{ marginTop: 22 }}>
            <TrustRow tone="glass" fontSize={14} items={p.trustItems} />
          </div>
          <div style={{ marginTop: "auto", paddingTop: 24 }}>
            {p.promoCode ? (
              <div style={{ marginBottom: 14 }}>
                <PromoCodeChip code={p.promoCode} fontSize={15} />
              </div>
            ) : null}
            <CtaButton label={p.cta || "Claim Offer"} navy={p.navy} blue={p.blue} fontSize={20} fullWidth />
            <div style={{ marginTop: 14 }}>
              <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={14} />
            </div>
          </div>
        </div>
        <HeroPhoto
          src={secondary}
          style={{ height: 160, flexShrink: 0 }}
          overlay="linear-gradient(0deg, rgba(11,31,74,0.35), rgba(11,31,74,0.1))"
        />
      </div>
    </>
  );
}

/** Google Business: simple, trust-first cover. */
export function LayoutGoogle(p: SocialLayoutProps) {
  const hero = resolveHeroImage(p.format ?? undefined, p.heroImageUrl);
  const offerSize = scaleType(56, p.offer, 12, 18);

  return (
    <>
      <HeroPhoto
        src={hero}
        style={{ position: "absolute", inset: 0 }}
        overlay="linear-gradient(90deg, rgba(11,31,74,0.92) 0%, rgba(11,31,74,0.7) 50%, rgba(11,31,74,0.35) 100%)"
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 48px",
          boxSizing: "border-box",
          maxWidth: "70%",
        }}
      >
        <BrandMark brand={p.brand} size={15} logoUrl={p.logoUrl} />
        <div>
          <TrustRow tone="glass" fontSize={14} items={p.trustItems} />
          <div style={{ marginTop: 16 }}>
            <OfferHeadline offer={p.offer} fontSize={offerSize} />
          </div>
          <div style={{ marginTop: 12 }}>
            <BodyCopy fontSize={24} weight={700}>
              {p.headline}
            </BodyCopy>
          </div>
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <CtaButton label={p.cta || "Book Now"} navy={p.navy} blue={p.blue} fontSize={17} />
            {p.promoCode ? <PromoCodeChip code={p.promoCode} fontSize={13} /> : null}
          </div>
          <div style={{ marginTop: 14 }}>
            <FooterBrand landing={p.landing} endsAt={p.endsAt} fontSize={13} />
          </div>
        </div>
      </div>
    </>
  );
}

/** Fallback for unknown aspect ratios. */
export function LayoutLandscapeFallback(p: SocialLayoutProps) {
  const ratio = p.height / p.width;
  if (ratio > 1.4) return <LayoutStory {...p} />;
  if (Math.abs(ratio - 1) < 0.08) return <LayoutInstagramFeed {...p} />;
  return <LayoutFacebook {...p} />;
}
