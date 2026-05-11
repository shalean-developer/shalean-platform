import { describe, expect, it } from "vitest";
import {
  type CleanerAvailabilityInputs,
  deriveCleanerAvailabilityState,
  toneForCleanerAvailabilityState,
} from "@/lib/cleaner/cleanerAvailabilityState";

const base: CleanerAvailabilityInputs = {
  browserOnline: true,
  isAvailable: true,
  rosterIncludesToday: true,
  hasActiveJob: false,
  hasFutureBookedJob: false,
};

describe("deriveCleanerAvailabilityState", () => {
  it("returns Offline when the device/browser is offline (overrides every other flag)", () => {
    const s = deriveCleanerAvailabilityState({
      ...base,
      browserOnline: false,
      isAvailable: true,
      rosterIncludesToday: true,
      hasActiveJob: true,
      hasFutureBookedJob: true,
    });
    expect(s.label).toBe("Offline");
    expect(s.willingToReceive).toBe(false);
    expect(s.primaryAction).toBe("none");
    expect(s.stateKey).toBe("offline");
  });

  it("returns Paused when the cleaner manually toggled is_available off", () => {
    const s = deriveCleanerAvailabilityState({
      ...base,
      isAvailable: false,
    });
    expect(s.label).toBe("Paused");
    expect(s.willingToReceive).toBe(false);
    expect(s.primaryAction).toBe("go-online");
    expect(s.stateKey).toBe("paused");
  });

  it("returns In job when actively working, even on a non-roster day", () => {
    const s = deriveCleanerAvailabilityState({
      ...base,
      hasActiveJob: true,
      rosterIncludesToday: false,
      hasFutureBookedJob: true, // ignored: active job dominates
    });
    expect(s.label).toBe("In job");
    expect(s.willingToReceive).toBe(true);
    expect(s.primaryAction).toBe("go-offline");
    expect(s.stateKey).toBe("in-job");
  });

  it("returns Off today when manually online but today is not a roster day", () => {
    const s = deriveCleanerAvailabilityState({
      ...base,
      rosterIncludesToday: false,
      hasFutureBookedJob: true, // ignored: roster wins over future booking display
    });
    expect(s.label).toBe("Off today");
    expect(s.willingToReceive).toBe(true);
    expect(s.primaryAction).toBe("go-offline");
    expect(s.stateKey).toBe("off-today");
  });

  it("returns Booked when online + roster + future job, no active job", () => {
    const s = deriveCleanerAvailabilityState({
      ...base,
      hasFutureBookedJob: true,
    });
    expect(s.label).toBe("Booked");
    expect(s.willingToReceive).toBe(true);
    expect(s.primaryAction).toBe("go-offline");
    expect(s.stateKey).toBe("booked");
  });

  it("returns Online for the steady-state idle case", () => {
    const s = deriveCleanerAvailabilityState({ ...base });
    expect(s.label).toBe("Online");
    expect(s.willingToReceive).toBe(true);
    expect(s.primaryAction).toBe("go-offline");
    expect(s.stateKey).toBe("online");
  });

  // Full matrix from the product spec — one assertion per row of the table
  // the user provided. Keeps regressions impossible without explicit intent.
  describe("product spec matrix", () => {
    it("manual offline → Paused, no offers, Go online button", () => {
      const s = deriveCleanerAvailabilityState({ ...base, isAvailable: false });
      expect(s).toMatchObject({ label: "Paused", willingToReceive: false, primaryAction: "go-online" });
    });

    it("not a working day → Off today, Go offline button still available", () => {
      const s = deriveCleanerAvailabilityState({ ...base, rosterIncludesToday: false });
      expect(s).toMatchObject({ label: "Off today", willingToReceive: true, primaryAction: "go-offline" });
    });

    it("working day + no active job → Online", () => {
      const s = deriveCleanerAvailabilityState({ ...base });
      expect(s).toMatchObject({ label: "Online", willingToReceive: true });
    });

    it("accepted future job (no active) → Booked + still receiving", () => {
      const s = deriveCleanerAvailabilityState({ ...base, hasFutureBookedJob: true });
      expect(s).toMatchObject({ label: "Booked", willingToReceive: true });
    });

    it("job in progress → In job (workload), still willing", () => {
      const s = deriveCleanerAvailabilityState({ ...base, hasActiveJob: true });
      expect(s).toMatchObject({ label: "In job", willingToReceive: true });
    });

    it("after completion + still working day + manually online → Online again", () => {
      // Inputs reflect the deriver's post-completion view: no active job,
      // no future booked job, roster on, manually available.
      const s = deriveCleanerAvailabilityState({ ...base });
      expect(s).toMatchObject({ label: "Online", willingToReceive: true });
    });

    it("after completion + not a working day → Off today (not Online)", () => {
      const s = deriveCleanerAvailabilityState({ ...base, rosterIncludesToday: false });
      expect(s).toMatchObject({ label: "Off today", willingToReceive: true });
    });

    it("after completion + manually offline → stays Paused (NOT auto-online)", () => {
      const s = deriveCleanerAvailabilityState({ ...base, isAvailable: false });
      expect(s).toMatchObject({ label: "Paused", willingToReceive: false });
    });
  });

  describe("tone mapping", () => {
    it("emerald for online + booked", () => {
      expect(toneForCleanerAvailabilityState(deriveCleanerAvailabilityState({ ...base }))).toBe("emerald");
      expect(
        toneForCleanerAvailabilityState(
          deriveCleanerAvailabilityState({ ...base, hasFutureBookedJob: true }),
        ),
      ).toBe("emerald");
    });

    it("sky for in-job (distinct from steady online)", () => {
      expect(
        toneForCleanerAvailabilityState(deriveCleanerAvailabilityState({ ...base, hasActiveJob: true })),
      ).toBe("sky");
    });

    it("amber for paused / off-today", () => {
      expect(
        toneForCleanerAvailabilityState(deriveCleanerAvailabilityState({ ...base, isAvailable: false })),
      ).toBe("amber");
      expect(
        toneForCleanerAvailabilityState(
          deriveCleanerAvailabilityState({ ...base, rosterIncludesToday: false }),
        ),
      ).toBe("amber");
    });

    it("red for offline (network)", () => {
      expect(
        toneForCleanerAvailabilityState(deriveCleanerAvailabilityState({ ...base, browserOnline: false })),
      ).toBe("red");
    });
  });
});
