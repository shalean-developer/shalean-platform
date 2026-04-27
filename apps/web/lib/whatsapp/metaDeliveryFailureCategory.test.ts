import { describe, expect, it } from "vitest";
import { classifyMetaWhatsappDeliveryFailure } from "@/lib/whatsapp/metaDeliveryFailureCategory";

describe("classifyMetaWhatsappDeliveryFailure", () => {
  it("maps invalid recipient patterns", () => {
    expect(classifyMetaWhatsappDeliveryFailure([{ code: 131026, title: "Undeliverable" }])).toBe("invalid_number");
    expect(classifyMetaWhatsappDeliveryFailure({ message: "Invalid phone number" })).toBe("invalid_number");
  });

  it("maps blocked", () => {
    expect(classifyMetaWhatsappDeliveryFailure([{ code: 131031 }])).toBe("blocked");
    expect(classifyMetaWhatsappDeliveryFailure({ error: "blocked by user" })).toBe("blocked");
  });

  it("maps template rejection", () => {
    expect(classifyMetaWhatsappDeliveryFailure({ details: "template rejected by policy" })).toBe("template_rejected");
  });

  it("maps rate limit", () => {
    expect(classifyMetaWhatsappDeliveryFailure([{ code: 80007 }])).toBe("rate_limited");
    expect(classifyMetaWhatsappDeliveryFailure({ error: "throttled" })).toBe("rate_limited");
  });

  it("returns unknown for empty or unrecognized", () => {
    expect(classifyMetaWhatsappDeliveryFailure(null)).toBe("unknown");
    expect(classifyMetaWhatsappDeliveryFailure({})).toBe("unknown");
  });
});
