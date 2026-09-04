import { describe, expect, it } from "vitest";
import type { ServicesCatalog } from "@/lib/booking-v2/bookingV2CatalogTypes";
import { buildAuthoritativePublicExtrasGroups } from "@/lib/services/publicServiceExtras";

function catalogWithExtras(
  overrides: Partial<
    Record<
      keyof ServicesCatalog,
      ServicesCatalog[keyof ServicesCatalog]["extras"]
    >
  >,
) {
  return Object.fromEntries(
    [
      "regular-cleaning",
      "deep-cleaning",
      "moving-cleaning",
      "airbnb-cleaning",
      "office-cleaning",
      "carpet-cleaning",
    ].map((slug) => [
      slug,
      { extras: overrides[slug as keyof ServicesCatalog] ?? [] },
    ]),
  ) as ServicesCatalog;
}

describe("buildAuthoritativePublicExtrasGroups", () => {
  it("publishes no fallback prices when the live catalogue is unavailable", () => {
    const catalog = catalogWithExtras({
      "regular-cleaning": [
        {
          id: "inside-fridge",
          label: "Inside Fridge",
          description: "",
          priceZar: 150,
          isPopular: false,
        },
      ],
    });

    expect(buildAuthoritativePublicExtrasGroups(catalog, false)).toEqual([]);
  });

  it("treats an empty live service extras list as authoritative", () => {
    const catalog = catalogWithExtras({
      "deep-cleaning": [
        {
          id: "carpet-cleaning",
          label: "Carpet Cleaning",
          description: "",
          priceZar: 350,
          isPopular: true,
        },
      ],
    });

    expect(buildAuthoritativePublicExtrasGroups(catalog, true)).toEqual([
      {
        slug: "deep-cleaning",
        label: "Deep Cleaning",
        extras: [
          {
            id: "carpet-cleaning",
            label: "Carpet Cleaning",
            description: "",
            priceZar: 350,
            isPopular: true,
          },
        ],
      },
    ]);
  });
});
