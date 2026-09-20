import type {
  FormQuestion,
  ServiceSlug,
} from "@/src/features/booking-v2/config/serviceConfig";

export type BookingDetailsStage =
  | "address"
  | "property"
  | "move"
  | "rooms"
  | "pets"
  | "equipment"
  | "condition"
  | "preferences"
  | "turnover";

type Details = Record<string, string | number | boolean>;

export type BookingDetailsAddress = {
  address?: string;
  suburb?: string;
  contactPhone?: string;
  serviceAreaLocationId?: string;
};

const STAGES: Record<ServiceSlug, readonly BookingDetailsStage[]> = {
  "regular-cleaning": ["address", "property", "rooms", "pets", "equipment"],
  "deep-cleaning": ["address", "property", "rooms", "pets"],
  "moving-cleaning": ["address", "property", "move", "rooms", "condition"],
  "office-cleaning": ["address", "property", "rooms", "preferences"],
  "carpet-cleaning": ["address", "property", "rooms", "condition"],
  "airbnb-cleaning": ["address", "property", "rooms", "turnover"],
};

const EXTRAS_STAGE: Record<ServiceSlug, BookingDetailsStage> = {
  "regular-cleaning": "equipment",
  "deep-cleaning": "pets",
  "moving-cleaning": "condition",
  "office-cleaning": "preferences",
  "carpet-cleaning": "condition",
  "airbnb-cleaning": "turnover",
};

function has(details: Details, key: string): boolean {
  return Boolean(String(details[key] ?? "").trim());
}

function all(details: Details, keys: readonly string[]): boolean {
  return keys.every((key) => has(details, key));
}

export function bookingDetailsAddressReady(address: BookingDetailsAddress): boolean {
  return (
    String(address.address ?? "").trim().length >= 5 &&
    String(address.suburb ?? "").trim().length >= 2 &&
    Boolean(String(address.contactPhone ?? "").trim()) &&
    Boolean(String(address.serviceAreaLocationId ?? "").trim())
  );
}

export function isProgressiveBookingDetailsService(
  serviceSlug: ServiceSlug,
): boolean {
  return Boolean(STAGES[serviceSlug]);
}

export function bookingDetailsStageFromSearchParam(
  serviceSlug: ServiceSlug,
  value: string | null | undefined,
): BookingDetailsStage | null {
  return STAGES[serviceSlug].includes(value as BookingDetailsStage)
    ? (value as BookingDetailsStage)
    : null;
}

export function bookingDetailsStage(
  serviceSlug: ServiceSlug,
  details: Details,
  address: BookingDetailsAddress = {},
): BookingDetailsStage {
  if (!bookingDetailsAddressReady(address)) return "address";

  switch (serviceSlug) {
    case "regular-cleaning":
      if (!has(details, "propertyType")) return "property";
      if (!all(details, ["bedrooms", "bathrooms", "extraRooms"])) return "rooms";
      if (!has(details, "hasPets")) return "pets";
      return "equipment";

    case "deep-cleaning":
      if (!has(details, "propertyType")) return "property";
      if (!all(details, ["bedrooms", "bathrooms", "extraRooms"])) return "rooms";
      return "pets";

    case "moving-cleaning":
      if (!has(details, "propertyType")) return "property";
      if (!has(details, "moveType")) return "move";
      if (!all(details, ["bedrooms", "bathrooms", "extraRooms"])) return "rooms";
      return "condition";

    case "office-cleaning":
      if (!has(details, "officeType")) return "property";
      if (!all(details, ["officeSize", "bathrooms"])) return "rooms";
      return "preferences";

    case "carpet-cleaning":
      if (!has(details, "propertyType")) return "property";
      if (!all(details, ["carpetRooms", "rugCount", "carpetType"])) return "rooms";
      return "condition";

    case "airbnb-cleaning":
      if (!has(details, "propertyType")) return "property";
      if (!all(details, ["bedrooms", "bathrooms", "extraRooms"])) return "rooms";
      return "turnover";
  }
}

export function bookingDetailsStageReady(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage,
  details: Details,
  address: BookingDetailsAddress,
): boolean {
  if (stage === "address") return bookingDetailsAddressReady(address);

  switch (serviceSlug) {
    case "regular-cleaning":
      if (stage === "property") return has(details, "propertyType");
      if (stage === "rooms") return all(details, ["bedrooms", "bathrooms", "extraRooms"]);
      if (stage === "pets") return has(details, "hasPets");
      return stage === "equipment";

    case "deep-cleaning":
      if (stage === "property") return has(details, "propertyType");
      if (stage === "rooms") return all(details, ["bedrooms", "bathrooms", "extraRooms"]);
      if (stage === "pets") return all(details, ["lastCleaned", "hasPets"]);
      return false;

    case "moving-cleaning":
      if (stage === "property") return has(details, "propertyType");
      if (stage === "move") return has(details, "moveType");
      if (stage === "rooms") return all(details, ["bedrooms", "bathrooms", "extraRooms"]);
      if (stage === "condition") {
        const baseReady = all(details, ["furnished", "hasPets"]);
        return String(details.moveType ?? "") === "move_out"
          ? baseReady && has(details, "depositInspection")
          : baseReady;
      }
      return false;

    case "office-cleaning":
      if (stage === "property") return has(details, "officeType");
      if (stage === "rooms") return all(details, ["officeSize", "bathrooms"]);
      if (stage === "preferences") return has(details, "afterHours");
      return false;

    case "carpet-cleaning":
      if (stage === "property") return has(details, "propertyType");
      if (stage === "rooms") return all(details, ["carpetRooms", "rugCount", "carpetType"]);
      if (stage === "condition") return all(details, ["stains", "hasPets"]);
      return false;

    case "airbnb-cleaning":
      if (stage === "property") return has(details, "propertyType");
      if (stage === "rooms") return all(details, ["bedrooms", "bathrooms", "extraRooms"]);
      if (stage === "turnover") {
        return all(details, ["linens", "guestCheckout", "keyAccess", "welcomeBasket"]);
      }
      return false;
  }
}

export function adjacentBookingDetailsStage(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage,
  direction: "back" | "next",
): BookingDetailsStage | null {
  const stages = STAGES[serviceSlug];
  const index = stages.indexOf(stage);
  if (index < 0) return null;
  const target = direction === "next" ? index + 1 : index - 1;
  return stages[target] ?? null;
}

export function bookingDetailsAutoAdvanceTarget(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage,
  details: Details,
): BookingDetailsStage | null {
  if (stage === "property") {
    const propertyReady =
      serviceSlug === "office-cleaning"
        ? has(details, "officeType")
        : has(details, "propertyType");
    if (!propertyReady) return null;
    return serviceSlug === "moving-cleaning" ? "move" : "rooms";
  }

  if (
    serviceSlug === "moving-cleaning" &&
    stage === "move" &&
    has(details, "moveType")
  ) {
    return "rooms";
  }

  return null;
}

export function bookingDetailsStageAutoAdvances(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage,
): boolean {
  return (
    stage === "property" ||
    (serviceSlug === "moving-cleaning" && stage === "move")
  );
}

export function bookingDetailsShowsExtras(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage | null,
): boolean {
  return stage === EXTRAS_STAGE[serviceSlug];
}

export function bookingDetailsQuestionStage(
  serviceSlug: ServiceSlug,
  question: Pick<FormQuestion, "key" | "group">,
): BookingDetailsStage | null {
  switch (serviceSlug) {
    case "regular-cleaning":
      if (question.key === "propertyType") return "property";
      if (question.group === "rooms") return "rooms";
      if (question.key === "hasPets") return "pets";
      return null;

    case "deep-cleaning":
      if (question.key === "propertyType") return "property";
      if (question.group === "rooms") return "rooms";
      if (question.key === "lastCleaned" || question.key === "hasPets") return "pets";
      return null;

    case "moving-cleaning":
      if (question.key === "propertyType") return "property";
      if (question.key === "moveType") return "move";
      if (question.group === "rooms") return "rooms";
      if (question.group === "condition") return "condition";
      return null;

    case "office-cleaning":
      if (question.key === "frequency") return null;
      if (question.key === "officeType") return "property";
      if (question.key === "officeSize" || question.key === "bathrooms") return "rooms";
      if (question.key === "afterHours") return "preferences";
      return null;

    case "carpet-cleaning":
      if (question.key === "propertyType") return "property";
      if (["carpetRooms", "rugCount", "carpetType"].includes(question.key)) return "rooms";
      if (question.key === "stains" || question.key === "hasPets") return "condition";
      return null;

    case "airbnb-cleaning":
      if (question.key === "propertyType") return "property";
      if (question.group === "rooms") return "rooms";
      if (["linens", "guestCheckout", "keyAccess", "welcomeBasket"].includes(question.key)) {
        return "turnover";
      }
      return null;
  }
}

export function bookingDetailsQuestionVisibleAtStage(
  serviceSlug: ServiceSlug,
  question: Pick<FormQuestion, "key" | "group">,
  stage: BookingDetailsStage | null,
): boolean {
  if (!stage) return false;
  const questionStage = bookingDetailsQuestionStage(serviceSlug, question);
  if (!questionStage) return false;

  // Preserve the approved Regular/Deep presentation where Property remains
  // visible while the room-count controls are being completed.
  if (
    (serviceSlug === "regular-cleaning" || serviceSlug === "deep-cleaning") &&
    question.key === "propertyType"
  ) {
    return stage === "property" || stage === "rooms";
  }

  return questionStage === stage;
}

export function bookingDetailsFinalStage(serviceSlug: ServiceSlug): BookingDetailsStage {
  const stages = STAGES[serviceSlug];
  return stages[stages.length - 1];
}

export function bookingDetailsStageIndex(
  serviceSlug: ServiceSlug,
  stage: BookingDetailsStage,
): number {
  return STAGES[serviceSlug].indexOf(stage);
}


const PROGRESSIVE_INDIVIDUAL_SCHEDULE_SERVICES = new Set<ServiceSlug>([
  "regular-cleaning",
  "office-cleaning",
  "carpet-cleaning",
  "airbnb-cleaning",
]);

export function usesProgressiveIndividualSchedule(
  serviceSlug: ServiceSlug,
): boolean {
  return PROGRESSIVE_INDIVIDUAL_SCHEDULE_SERVICES.has(serviceSlug);
}
