/**
 * Pure deriver for the cleaner dashboard availability/workload pill.
 *
 * Encodes the operational rule:
 *
 *     is_available  = cleaner's manual choice (willingness)
 *     working_days  = schedule eligibility (today is a roster day)
 *     bookings      = workload (active job in flight, or future booked job)
 *
 * The dashboard label and the "willing to receive offers" boolean are both
 * derived from these four orthogonal inputs — never from a single overloaded
 * `status` column. Backend code is responsible for keeping the inputs honest:
 *
 *   - Manual Go online / Go offline (PATCH /api/cleaner/me) is the ONLY
 *     writer of `cleaners.is_available`.
 *   - Workload (`cleaners.status` busy/available) is derived from booking
 *     rows by `syncCleanerBusyFromBookings` and never overwrites the
 *     manual flag.
 *
 * State matrix (mirrors the product spec):
 *
 *  | Situation                                    | label       | willing | action     |
 *  |----------------------------------------------|-------------|---------|------------|
 *  | Browser/device offline                       | Offline     | false   | none       |
 *  | Manually paused (is_available=false)         | Paused      | false   | go-online  |
 *  | Today is not a working day                   | Off today   | true    | go-offline |
 *  | Active job in progress / en route            | In job      | true    | go-offline |
 *  | Future booking accepted (no active job)      | Booked      | true    | go-offline |
 *  | Online + working day + idle                  | Online      | true    | go-offline |
 *
 * `willing` reflects manual willingness only — even when the cleaner is "In
 * job" or "Off today" we keep `willing=true` so the dashboard does not
 * misrepresent a backend-side schedule/workload gate as a manual pause. The
 * server-side eligibility filter is responsible for *not* sending overlapping
 * offers (slot-aware) — that concern is independent of UI labelling.
 */

export type CleanerAvailabilityLabel =
  | "Offline"
  | "Paused"
  | "Off today"
  | "In job"
  | "Booked"
  | "Online";

export type CleanerAvailabilityPrimaryAction = "go-online" | "go-offline" | "none";

export type CleanerAvailabilityState = {
  /** Short pill label for the dashboard status strip. */
  label: CleanerAvailabilityLabel;
  /** True when the cleaner is *willing* to receive offers (manual flag honored). */
  willingToReceive: boolean;
  /** Which primary toggle button to surface, if any. */
  primaryAction: CleanerAvailabilityPrimaryAction;
  /** Distinct state key — useful for analytics, tests, conditional copy. */
  stateKey:
    | "offline"
    | "paused"
    | "off-today"
    | "in-job"
    | "booked"
    | "online";
};

export type CleanerAvailabilityInputs = {
  /** Browser/device network online. False ⇒ "Offline" regardless of every other flag. */
  browserOnline: boolean;
  /** Manual willingness flag (`cleaners.is_available`). */
  isAvailable: boolean;
  /** Cleaner's weekday roster includes today (Johannesburg civil day). */
  rosterIncludesToday: boolean;
  /** A job is currently en route / in progress. */
  hasActiveJob: boolean;
  /** A future-dated booking is accepted but not yet active. */
  hasFutureBookedJob: boolean;
};

/**
 * Decision tree (highest precedence first):
 *
 *   1. !browserOnline           → Offline       (network — hard, not manual)
 *   2. !isAvailable             → Paused        (cleaner manually opted out)
 *   3. hasActiveJob             → In job        (workload trumps roster — actively working)
 *   4. !rosterIncludesToday     → Off today     (manually online, but roster says no)
 *   5. hasFutureBookedJob       → Booked        (online + working day + future booking)
 *   6. else                     → Online
 *
 * Note: order between `hasActiveJob` and `!rosterIncludesToday` favors the
 * active job — if a cleaner is mid-shift on a non-roster day (e.g. picked up
 * an offer earlier in the week), surfacing "In job" is more operationally
 * useful than telling them they're "Off today".
 */
export function deriveCleanerAvailabilityState(
  inputs: CleanerAvailabilityInputs,
): CleanerAvailabilityState {
  if (!inputs.browserOnline) {
    return {
      label: "Offline",
      willingToReceive: false,
      primaryAction: "none",
      stateKey: "offline",
    };
  }
  if (!inputs.isAvailable) {
    return {
      label: "Paused",
      willingToReceive: false,
      primaryAction: "go-online",
      stateKey: "paused",
    };
  }
  if (inputs.hasActiveJob) {
    return {
      label: "In job",
      willingToReceive: true,
      primaryAction: "go-offline",
      stateKey: "in-job",
    };
  }
  if (!inputs.rosterIncludesToday) {
    return {
      label: "Off today",
      willingToReceive: true,
      primaryAction: "go-offline",
      stateKey: "off-today",
    };
  }
  if (inputs.hasFutureBookedJob) {
    return {
      label: "Booked",
      willingToReceive: true,
      primaryAction: "go-offline",
      stateKey: "booked",
    };
  }
  return {
    label: "Online",
    willingToReceive: true,
    primaryAction: "go-offline",
    stateKey: "online",
  };
}

/**
 * Render hint for the strip dot color. Kept in this module so the visual
 * mapping stays co-located with the deriver and tests.
 */
export type CleanerAvailabilityTone = "red" | "amber" | "emerald" | "sky";

export function toneForCleanerAvailabilityState(
  state: CleanerAvailabilityState,
): CleanerAvailabilityTone {
  switch (state.stateKey) {
    case "offline":
      return "red";
    case "paused":
      return "amber";
    case "off-today":
      return "amber";
    case "in-job":
      return "sky";
    case "booked":
      return "emerald";
    case "online":
    default:
      return "emerald";
  }
}
