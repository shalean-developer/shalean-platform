import { describe, expect, it } from "vitest";
import { profileDetailsPatch, validateProfileDetails, type ProfileDetails } from "../customerProfileForm";
const details: ProfileDetails = { name: "Jane Doe", phone: "082 123 4567", whatsapp: "+27 82 123 4567", dateOfBirth: "1990-01-02", preferredContact: "email" };

describe("customer profile validation", () => {
  it("normalizes complete phone numbers and preserves full names", () => {
    expect(validateProfileDetails(details, "2026-11-08")).toEqual({});
    expect(profileDetailsPatch(details)).toMatchObject({ full_name: "Jane Doe", phone: "+27821234567", phone_e164: "+27821234567" });
  });
  it.each(["082123456789", "+278212345678", "0821234567abc", "0001234567", "", "1"])("rejects malformed numbers without truncating them: %s", phone => {
    const errors = validateProfileDetails({ ...details, phone });
    expect(Boolean(errors.phone)).toBe(Boolean(phone));
  });
  it("clears both stored phone columns and date rather than omitting them", () => {
    expect(profileDetailsPatch({ ...details, phone: "", dateOfBirth: "" })).toMatchObject({ phone: null, phone_e164: null, date_of_birth: null });
  });
  it.each(["2027-01-01", "2026-02-30", "not-a-date", "1899-12-31"])("rejects invalid or future birthdays: %s", dateOfBirth => {
    expect(validateProfileDetails({ ...details, dateOfBirth }, "2026-11-08").dateOfBirth).toBeTruthy();
  });
  it("requires a usable number for the selected contact method", () => {
    expect(validateProfileDetails({ ...details, phone: "", preferredContact: "phone" }).phone).toBeTruthy();
    expect(validateProfileDetails({ ...details, whatsapp: "", preferredContact: "whatsapp" }).whatsapp).toBeTruthy();
    expect(validateProfileDetails({ ...details, phone: "", whatsapp: "", preferredContact: "email" })).toEqual({});
  });
  it("rejects empty names before saving", () => {
    expect(validateProfileDetails({ ...details, name: " " }).name).toBeTruthy();
  });
});
