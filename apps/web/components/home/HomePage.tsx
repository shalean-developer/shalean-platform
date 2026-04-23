import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { FadeInSection } from "@/components/home/FadeInSection";
import { HomeMobileStickyCta } from "@/components/home/HomeMobileStickyCta";
import { HomeWhatsAppFloat } from "@/components/home/HomeWhatsAppFloat";
import { AreasWeServeSection } from "@/components/home/sections/AreasWeServeSection";
import { BeforeAfterSection } from "@/components/home/sections/BeforeAfterSection";
import { FAQSection } from "@/components/home/sections/FAQSection";
import { FinalCtaSection } from "@/components/home/sections/FinalCtaSection";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { HeroSection } from "@/components/home/sections/HeroSection";
import { HowItWorksSection } from "@/components/home/sections/HowItWorksSection";
import { PricingPreviewSection } from "@/components/home/sections/PricingPreviewSection";
import { ServicesSection } from "@/components/home/sections/ServicesSection";
import { TestimonialsSection } from "@/components/home/sections/TestimonialsSection";
import { TrustBarSection } from "@/components/home/sections/TrustBarSection";
import { WhyChooseUsSection } from "@/components/home/sections/WhyChooseUsSection";

export function HomePage() {
  return (
    <>
      <GrowthTracking event="page_view" payload={{ page_type: "home" }} />
      <main className="min-h-screen bg-white pb-24 text-zinc-900 md:pb-0">
        <FadeInSection>
          <HeroSection />
        </FadeInSection>
        <FadeInSection>
          <TrustBarSection />
        </FadeInSection>
        <FadeInSection>
          <ServicesSection />
        </FadeInSection>
        <FadeInSection>
          <WhyChooseUsSection />
        </FadeInSection>
        <FadeInSection>
          <HowItWorksSection />
        </FadeInSection>
        <FadeInSection>
          <PricingPreviewSection />
        </FadeInSection>
        <FadeInSection>
          <AreasWeServeSection />
        </FadeInSection>
        <FadeInSection>
          <TestimonialsSection />
        </FadeInSection>
        <FadeInSection>
          <BeforeAfterSection />
        </FadeInSection>
        <FadeInSection>
          <FinalCtaSection />
        </FadeInSection>
        <FadeInSection>
          <FAQSection />
        </FadeInSection>
        <FooterSection />
      </main>
      <HomeWhatsAppFloat />
      <HomeMobileStickyCta />
    </>
  );
}
