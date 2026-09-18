import { describe, expect, it } from "vitest";
import {
  serviceIncludesShaleanSupplies,
  serviceRequiresCustomerEquipmentChoice,
  serviceSuppliesPolicy,
} from "@/lib/booking-v2/serviceSuppliesPolicy";
import { buildDefaultBookingV2CatalogConfig } from "@/lib/booking-v2/bookingV2ServiceDefinitions";

describe("serviceSuppliesPolicy", () => {
  it("requires a customer equipment choice for Regular and Airbnb", () => {
    expect(serviceSuppliesPolicy("regular-cleaning")).toBe("customer_or_shalean_logistics");
    expect(serviceSuppliesPolicy("airbnb-cleaning")).toBe("customer_or_shalean_logistics");
    expect(serviceRequiresCustomerEquipmentChoice("regular-cleaning")).toBe(true);
    expect(serviceRequiresCustomerEquipmentChoice("airbnb-cleaning")).toBe(true);
  });

  it("includes Shalean supplies for Deep and Moving", () => {
    expect(serviceSuppliesPolicy("deep-cleaning")).toBe("shalean_included");
    expect(serviceSuppliesPolicy("moving-cleaning")).toBe("shalean_included");
    expect(serviceIncludesShaleanSupplies("deep-cleaning")).toBe(true);
    expect(serviceIncludesShaleanSupplies("moving-cleaning")).toBe(true);
    expect(serviceRequiresCustomerEquipmentChoice("deep-cleaning")).toBe(false);
    expect(serviceRequiresCustomerEquipmentChoice("moving-cleaning")).toBe(false);
  });

  it("keeps Office and Carpet unresolved instead of inventing a policy", () => {
    expect(serviceSuppliesPolicy("office-cleaning")).toBe("unresolved");
    expect(serviceSuppliesPolicy("carpet-cleaning")).toBe("unresolved");
    expect(serviceRequiresCustomerEquipmentChoice("office-cleaning")).toBe(false);
    expect(serviceRequiresCustomerEquipmentChoice("carpet-cleaning")).toBe(false);
  });

  it("propagates the policy into the default booking catalog", () => {
    const config = buildDefaultBookingV2CatalogConfig();
    const bySlug = Object.fromEntries(config.services.map((service) => [service.slug, service]));

    expect(bySlug["regular-cleaning"]?.showEquipmentQuestion).toBe(true);
    expect(bySlug["airbnb-cleaning"]?.showEquipmentQuestion).toBe(true);
    expect(bySlug["deep-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["moving-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["office-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["carpet-cleaning"]?.showEquipmentQuestion).toBe(false);
  });
});
