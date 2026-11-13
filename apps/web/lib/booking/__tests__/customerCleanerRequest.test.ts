import { describe, expect, it } from "vitest";
import { customerCleanerRequest } from "../customerCleanerRequest";
import { buildBookingV2MutablePersistence } from "../../booking-v2/buildBookingV2MutablePersistence";
import { preferredCleanerAssignmentFields } from "../persistPreferredCleaners";
import { adminBookingSelectedAtCheckoutId } from "../../admin/adminBookingAssignmentLabels";
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
describe("customer staffing intent", () => {
 it.each([1,2,3])("preserves %i requested places independently of named preferences", count => {
  const row=buildBookingV2MutablePersistence({ customerPhone:null,canonicalServiceSlug:"standard",serviceSlug:"regular-cleaning",date:"2026-11-30",time:"09:00",bookingType:"once_off",pricingVersionId:"test",fulfillmentMode:"ops_assignment",fulfillmentReason:"multi_cleaner_roster_required",address:"Synthetic",suburb:"Synthetic", cleanerMode:"individual_cleaners",cleanerCount:count,preferredCleanerIds:ids.slice(0,Math.min(count,2)),preferredCleanerFields:preferredCleanerAssignmentFields(ids.slice(0,Math.min(count,2))),bookingSnapshot:{cleanerCount:count}, recurringDays:[],serviceDetails:{},selectedExtraIds:[],persistPricing:{},equipmentPersist:{},locationFields:{},priceSnapshot:{} } as Parameters<typeof buildBookingV2MutablePersistence>[0]);
  expect(row.cleaner_count).toBe(count);
 });
 it("recovers saved names when the mutable lead column was cleared",()=>{
  const row={selected_cleaner_id:null,booking_snapshot:{cleanerCount:3,selectedCleanerIds:ids}};
  expect(customerCleanerRequest(row)).toEqual({count:3,preferredIds:ids,needsRoster:true});
  expect(adminBookingSelectedAtCheckoutId(row)).toBe(ids[0]);
 });
 it("uses immutable requested quantity if a mutable roster count was reduced",()=>{
  expect(customerCleanerRequest({cleaner_count:1,booking_snapshot:{cleanerCount:3}}).count).toBe(3);
 });
 it("never interprets a formal service team as a customer multi-cleaner request",()=>{
  expect(customerCleanerRequest({cleaner_count:3,is_team_job:true}).needsRoster).toBe(false);
 });
 it("ignores malformed names, deduplicates ids and retains lead fallback",()=>{
  expect(customerCleanerRequest({selected_cleaner_id:ids[0],booking_snapshot:{selectedCleanerIds:['bad']}}).preferredIds).toEqual([ids[0]]);
  expect(customerCleanerRequest({booking_snapshot:{selectedCleanerIds:[ids[0],ids[0]]}}).preferredIds).toEqual([ids[0]]);
 });
});
