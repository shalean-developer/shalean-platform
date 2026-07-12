import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BookingFormData } from "@/lib/booking/types";
import { isServiceSlug } from "@/lib/booking/serviceMeta";
import { defaultBookingFormData } from "@/lib/booking/defaultForm";

const DRAFT_KEY = "shalean.customer.booking-v2.v1";
export const REFERRAL_CODE_KEY = "shalean.customer.referral_code";

export async function loadBookingDraft(): Promise<BookingFormData | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingFormData>;
    if (!parsed.serviceSlug || !isServiceSlug(parsed.serviceSlug)) return null;
    return {
      ...defaultBookingFormData(parsed.serviceSlug),
      ...parsed,
      serviceSlug: parsed.serviceSlug,
    };
  } catch {
    return null;
  }
}

export async function saveBookingDraft(form: BookingFormData): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    // Ignore persistence failures
  }
}

export async function clearBookingDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export async function getStoredReferralCode(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(REFERRAL_CODE_KEY);
    const trimmed = code?.trim().toUpperCase() ?? "";
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function setStoredReferralCode(code: string): Promise<void> {
  try {
    const v = code.trim().toUpperCase();
    if (!v) {
      await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
      return;
    }
    await AsyncStorage.setItem(REFERRAL_CODE_KEY, v);
  } catch {
    // ignore
  }
}
