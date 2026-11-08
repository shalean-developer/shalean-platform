import { describe, expect, it } from "vitest";
import { liveRegularSection, bookingFunnelNavigation, buildLiveBookingSectionDiagnostics, sanitizeBookingNavigationMetadata } from "../liveBookingFunnel";
describe("live booking funnel diagnostics", () => {
  it("allows only known screen IDs for the matching wizard stage", () => {
    expect(liveRegularSection(1, "address")).toBe("address");
    expect(liveRegularSection(2, "date_time")).toBe("date_time");
    expect(liveRegularSection(2, "address")).toBeUndefined();
    expect(liveRegularSection(1, "customer@example.com")).toBeUndefined();
  });
  it("attributes backward movement to the screen left, not the destination", () => {
    expect(bookingFunnelNavigation({step:2,section:"cleaner"},{step:1,section:"equipment"})).toMatchObject({
      step:2,event:"back",metadata:{from_step:2,to_step:1,section:"cleaner",to_section:"equipment"},
    });
  });
  it("tracks internal forward/back movement without inventing wizard step changes", () => {
    expect(bookingFunnelNavigation({step:1,section:"address"},{step:1,section:"property"})?.event).toBe("next");
    expect(bookingFunnelNavigation({step:1,section:"rooms"},{step:1,section:"property"})?.event).toBe("back");
    expect(bookingFunnelNavigation({step:1,section:"rooms"},{step:1,section:"rooms"})).toBeNull();
    expect(bookingFunnelNavigation({step:3},{step:3})).toBeNull();
  });
  it("counts unique correlated sessions and does not backfill historical screens", () => {
    const row={session_id:"s",analytics_session_id:"unified",step:"quote",event_type:"view",
      metadata:{service:"regular-cleaning",flow:"booking_v2",section:"rooms"}};
    const result=buildLiveBookingSectionDiagnostics([row,row,{...row,event_type:"exit"},
      {...row,session_id:"old",analytics_session_id:null,metadata:{service:"regular-cleaning",flow:"booking_v2"}},
      {...row,metadata:{...row.metadata,service:"deep-cleaning"}},
      {...row,metadata:{...row.metadata,section:"private-value"}}]);
    expect(result).toEqual([{step:"quote",section:"rooms",label:"Rooms",viewedSessions:1,continuedSessions:0,backSessions:0,exitSessions:1,errorSessions:0}]);
    expect(buildLiveBookingSectionDiagnostics([{...row,metadata:null}])).toEqual([]);
  });
  it("drops full URLs and query/hash data while retaining public route and useful metadata", () => {
    const result=sanitizeBookingNavigationMetadata({href:"https://shalean.co.za/book/regular-cleaning?email=private@example.com",
      pathname:"/book/regular-cleaning?token=private#secret",section:"address",reason:"validation",fields:["contactPhone"]});
    expect(result).toEqual({pathname:"/book/regular-cleaning",section:"address",reason:"validation",fields:["contactPhone"]});
    expect(sanitizeBookingNavigationMetadata({pathname:"/account/private-id",href:"private"})).toEqual({});
  });
  it("counts verified continuation/back once per viewed correlated session without inflating views", () => {
    const base = {session_id:"tab",analytics_session_id:"session",step:"quote",event_type:"view",
      metadata:{service:"regular-cleaning",flow:"booking_v2",section:"property"}};
    const next = {...base,event_type:"next",metadata:{...base.metadata,from_step:1,from_section:"property",to_step:1,to_section:"rooms"}};
    const back = {...next,event_type:"back",metadata:{...next.metadata,to_section:"address"}};
    const rows = buildLiveBookingSectionDiagnostics([next,base,next,back,back,
      {...next,analytics_session_id:"no-view"},
      {...next,metadata:{...next.metadata,to_section:"address"}},
      {...next,metadata:{...next.metadata,to_section:"unknown"}},
      {...next,metadata:{...next.metadata,from_section:"rooms"}}]);
    expect(rows).toEqual([{step:"quote",section:"property",label:"Property",viewedSessions:1,
      continuedSessions:1,backSessions:1,exitSessions:0,errorSessions:0}]);
  });

});
