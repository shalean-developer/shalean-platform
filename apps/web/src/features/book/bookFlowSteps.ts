import type { BookFlowFormState, BookFlowStep } from "@/src/features/book/bookFlowTypes";

export function normalizeBookFlowStep(raw: string | null): BookFlowStep {
  switch (raw) {
    case "service":
    case "property":
    case "schedule":
    case "cleaner":
    case "auth":
    case "summary":
      return raw;
    default:
      return "service";
  }
}

export function bookFlowStepIndex(step: BookFlowStep): number {
  const order: BookFlowStep[] = ["service", "property", "schedule", "cleaner", "auth", "summary"];
  return order.indexOf(step);
}

export function bookFlowStepLabel(step: BookFlowStep): string {
  switch (step) {
    case "service":
      return "Service";
    case "property":
      return "Property";
    case "schedule":
      return "Date & time";
    case "cleaner":
      return "Cleaner";
    case "auth":
      return "Account";
    case "summary":
      return "Summary";
  }
}

function hasService(form: BookFlowFormState): boolean {
  return Boolean(form.service);
}

function hasProperty(form: BookFlowFormState): boolean {
  return (
    form.serviceAreaLocationId != null &&
    form.location.trim().length >= 3 &&
    form.bedrooms >= 1 &&
    form.bathrooms >= 1
  );
}

function hasSchedule(form: BookFlowFormState): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(form.date) && /^\d{1,2}:\d{2}$/.test(form.time);
}

function hasCleaner(form: BookFlowFormState): boolean {
  return form.cleaner != null && form.cleaner.id.trim().length > 0;
}

export function canAccessBookFlowStep(
  step: BookFlowStep,
  form: BookFlowFormState,
  isAuthenticated: boolean,
): boolean {
  if (step === "service") return true;
  if (!hasService(form)) return false;
  if (step === "property") return true;
  if (!hasProperty(form)) return false;
  if (step === "schedule") return true;
  if (!hasSchedule(form)) return false;
  if (step === "cleaner") return true;
  if (!hasCleaner(form)) return false;
  if (step === "auth") return !isAuthenticated;
  if (step === "summary") return isAuthenticated;
  return false;
}

export function getBookFlowGateRedirect(
  step: BookFlowStep,
  form: BookFlowFormState,
  isAuthenticated: boolean,
): BookFlowStep | null {
  if (canAccessBookFlowStep(step, form, isAuthenticated)) return null;
  if (!hasService(form)) return "service";
  if (!hasProperty(form)) return "property";
  if (!hasSchedule(form)) return "schedule";
  if (!hasCleaner(form)) return "cleaner";
  if (!isAuthenticated) return "auth";
  return "summary";
}

export function nextBookFlowStep(
  step: BookFlowStep,
  isAuthenticated: boolean,
): BookFlowStep | null {
  switch (step) {
    case "service":
      return "property";
    case "property":
      return "schedule";
    case "schedule":
      return "cleaner";
    case "cleaner":
      return isAuthenticated ? "summary" : "auth";
    case "auth":
      return "summary";
    case "summary":
      return null;
  }
}

export function prevBookFlowStep(
  step: BookFlowStep,
  isAuthenticated: boolean,
): BookFlowStep | null {
  switch (step) {
    case "service":
      return null;
    case "property":
      return "service";
    case "schedule":
      return "property";
    case "cleaner":
      return "schedule";
    case "auth":
      return "cleaner";
    case "summary":
      return isAuthenticated ? "cleaner" : "auth";
  }
}

export function isBookStepComplete(step: BookFlowStep, form: BookFlowFormState): boolean {
  switch (step) {
    case "service":
      return hasService(form);
    case "property":
      return hasProperty(form);
    case "schedule":
      return hasSchedule(form);
    case "cleaner":
      return hasCleaner(form);
    case "auth":
    case "summary":
      return true;
  }
}
