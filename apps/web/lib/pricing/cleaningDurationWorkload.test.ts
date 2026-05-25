import { describe, expect, it } from "vitest";
import { BOOKING_SERVICE_IDS } from "@/components/booking/serviceCategories";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import {
  getCanonicalDurationExtraPolicy,
  getCanonicalDurationServicePolicy,
  listCanonicalDurationExtraPolicies,
  listCanonicalDurationServicePolicies,
  resolveCanonicalDurationWorkload,
} from "@/lib/pricing/cleaningDurationWorkload";

describe("canonical duration/workload resolver (Phase 2C)", () => {
  it("adds explicit duration for oven, fridge, and cabinets", () => {
    const base = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extras: [],
    });
    const withKitchenExtras = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extras: ["inside-oven", "inside-fridge", "inside-cabinets"],
    });

    expect(withKitchenExtras.duration_minutes - base.duration_minutes).toBe(105);
    expect(withKitchenExtras.extra_effects.map((e) => [e.slug, e.durationEffect, e.durationMinutes])).toEqual([
      ["inside-oven", "adds_duration", 45],
      ["inside-fridge", "adds_duration", 30],
      ["inside-cabinets", "adds_duration", 30],
    ]);
  });

  it("keeps supplies-kit as no duration effect", () => {
    const base = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extras: [],
    });
    const withSupplies = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extras: ["supplies-kit"],
    });

    expect(withSupplies.duration_minutes).toBe(base.duration_minutes);
    expect(withSupplies.extra_effects[0]).toMatchObject({
      slug: "supplies-kit",
      durationEffect: "no_duration_effect",
      teamScalable: false,
    });
  });

  it("treats extra-cleaner as a team-scaling workload semantic, not extra cleaning time", () => {
    const base = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 3,
      bathrooms: 2,
      extras: [],
    });
    const withExtraCleaner = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 3,
      bathrooms: 2,
      extras: ["extra-cleaner"],
    });

    expect(withExtraCleaner.duration_minutes).toBe(base.duration_minutes);
    expect(withExtraCleaner.team_member_count).toBe(2);
    expect(withExtraCleaner.team_scaled_duration_minutes).toBeLessThan(withExtraCleaner.duration_minutes);
    expect(withExtraCleaner.team_scaling_behavior).toBe("requested_extra_cleaner");
    expect(withExtraCleaner.extra_effects[0]).toMatchObject({
      slug: "extra-cleaner",
      durationEffect: "team_scaling_modifier",
      durationMinutes: 0,
    });
  });

  it("keeps Deep and Move heavier than Standard for the same room shape", () => {
    const shape = { rooms: 3, bathrooms: 2, extraRooms: 1, extras: [] as string[] };
    const standard = resolveCanonicalDurationWorkload({ service: "standard", ...shape });
    const deep = resolveCanonicalDurationWorkload({ service: "deep", ...shape });
    const move = resolveCanonicalDurationWorkload({ service: "move", ...shape });

    expect(deep.duration_minutes).toBeGreaterThan(standard.duration_minutes);
    expect(move.duration_minutes).toBeGreaterThan(standard.duration_minutes);
    expect(deep.workload_weight).toBeGreaterThan(standard.workload_weight);
    expect(move.workload_weight).toBeGreaterThan(standard.workload_weight);
  });

  it("does not scale Carpet duration from bathrooms", () => {
    const oneBathroom = resolveCanonicalDurationWorkload({
      service: "carpet",
      rooms: 3,
      bathrooms: 1,
      extras: [],
    });
    const fiveBathrooms = resolveCanonicalDurationWorkload({
      service: "carpet",
      rooms: 3,
      bathrooms: 5,
      extras: [],
    });

    expect(getCanonicalDurationServicePolicy("carpet").bathroomMinutes).toBe(0);
    expect(fiveBathrooms.duration_minutes).toBe(oneBathroom.duration_minutes);
  });

  it("flags and guards large-property duration realism", () => {
    const large = resolveCanonicalDurationWorkload({
      service: "deep",
      rooms: 12,
      bathrooms: 7,
      extraRooms: 9,
      extras: ["interior-walls", "garage-cleaning", "outside-windows"],
    });

    expect(large.operational_complexity).toBe("large_property");
    expect(large.guards).toContain("large_property");
    expect(large.duration_minutes).toBe(large.service_policy.maxMinutes);
    expect(large.guards).toContain("max_duration_clamped");
  });

  it("applies minimum and maximum guards", () => {
    const standardMinimum = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 1,
      bathrooms: 1,
      extras: [],
    });
    const largeStandard = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 25,
      bathrooms: 25,
      extraRooms: 25,
      extras: ["interior-walls", "garage-cleaning", "outside-windows"],
    });

    expect(standardMinimum.duration_minutes).toBeGreaterThanOrEqual(standardMinimum.service_policy.minMinutes);
    expect(largeStandard.duration_minutes).toBe(largeStandard.service_policy.maxMinutes);
    expect(largeStandard.guards).toContain("max_duration_clamped");
  });

  it("detects extras missing duration classification", () => {
    const registered = [...BOOKING_EXTRA_ID_SET].sort();
    const classified = listCanonicalDurationExtraPolicies().map((p) => p.slug).sort();

    expect(classified).toEqual(registered);
    for (const slug of registered) {
      const policy = getCanonicalDurationExtraPolicy(slug);
      expect(policy, `${slug} is missing a duration/workload policy`).not.toBeNull();
      expect(policy!.durationEffect, `${slug} has no duration effect class`).toMatch(
        /^(adds_duration|no_duration_effect|workload_multiplier_only|team_scaling_modifier)$/,
      );
    }
  });

  it("detects services missing duration policy", () => {
    const registered = [...BOOKING_SERVICE_IDS].sort();
    const classified = listCanonicalDurationServicePolicies().map((p) => p.serviceId).sort();

    expect(classified).toEqual(registered);
    for (const service of registered) {
      const policy = getCanonicalDurationServicePolicy(service);
      expect(policy.minMinutes, `${service} min guard`).toBeGreaterThan(0);
      expect(policy.maxMinutes, `${service} max guard`).toBeGreaterThan(policy.minMinutes);
      expect(policy.durationBasis, `${service} duration basis`).toBeTruthy();
    }
  });

  it("detects unrealistic duration outputs without changing runtime pricing", () => {
    const unknownExtra = resolveCanonicalDurationWorkload({
      service: "standard",
      rooms: 2,
      bathrooms: 1,
      extras: ["brand-new-extra"],
    });
    const impossibleSize = resolveCanonicalDurationWorkload({
      service: "move",
      rooms: 25,
      bathrooms: 25,
      extraRooms: 25,
      extras: ["interior-walls", "garage-cleaning", "outside-windows"],
    });

    expect(unknownExtra.unknown_extras).toEqual(["brand-new-extra"]);
    expect(impossibleSize.duration_minutes).toBe(impossibleSize.service_policy.maxMinutes);
    expect(impossibleSize.raw_duration_minutes).toBeGreaterThan(impossibleSize.duration_minutes);
    expect(impossibleSize.guards).toEqual(
      expect.arrayContaining(["large_property", "max_duration_clamped"]),
    );
  });
});
