import { describe, expect, it } from "vitest";
import {
  marketingHeaderLogoImageClass,
  marketingHeaderLogoLinkClass,
  marketingHomeMainPadding,
  marketingMobileHeaderActionsClass,
  marketingMobileHeaderBookIconClass,
  marketingMobileDrawerOpenPadding,
  marketingStickyCtaMainPadding,
  marketingWhatsAppFloatMainPadding,
} from "@/lib/marketing/marketingMobileLayout";

describe("marketingMobileLayout", () => {
  it("includes safe-area inset on sticky CTA padding", () => {
    expect(marketingStickyCtaMainPadding).toContain("env(safe-area-inset-bottom)");
    expect(marketingStickyCtaMainPadding).toContain("md:pb-0");
  });

  it("includes safe-area inset on homepage padding", () => {
    expect(marketingHomeMainPadding).toContain("env(safe-area-inset-bottom)");
  });

  it("clears WhatsApp float on desktop", () => {
    expect(marketingWhatsAppFloatMainPadding).toContain("md:pb-0");
  });

  it("includes safe-area inset on mobile drawer open padding", () => {
    expect(marketingMobileDrawerOpenPadding).toContain("env(safe-area-inset-bottom)");
  });

  it("uses 44px icon-only touch target on mobile header book CTA", () => {
    expect(marketingMobileHeaderBookIconClass).toContain("h-11 w-11");
  });

  it("pins mobile header actions to the trailing edge", () => {
    expect(marketingMobileHeaderActionsClass).toContain("ml-auto");
  });

  it("keeps logo left without width cap when actions use ml-auto", () => {
    expect(marketingHeaderLogoLinkClass).not.toContain("max-w-[calc");
    expect(marketingHeaderLogoImageClass).toContain("object-contain");
  });
});
