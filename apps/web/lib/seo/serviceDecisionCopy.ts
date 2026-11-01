import type { CapeTownSeoServiceSlug } from "./capeTownSeoPages";
export const SERVICE_DECISION_COPY: Record<CapeTownSeoServiceSlug, { heading: string; intro: string; checklist: string[] }> = {
  "standard-cleaning-cape-town": {
    "heading": "Choose regular cleaning for ongoing home upkeep",
    "intro": "Regular cleaning suits a home that needs routine kitchen, bathroom, dusting and floor care. Compare a single visit with a recurring schedule based on how the home is used.",
    "checklist": [
      "Choose deep cleaning if accumulated grease, bathroom residue or neglected detail needs a more intensive reset.",
      "Provide suitable products and equipment by default, or select an available paid supplies option and review its charge before checkout.",
      "List priority rooms and optional tasks so the booked visit matches what you need maintained."
    ]
  },
  "deep-cleaning-cape-town": {
    "heading": "Choose deep cleaning for accumulated build-up",
    "intro": "Deep cleaning focuses on detailed kitchen, bathroom and accessible surface work when routine maintenance is no longer enough.",
    "checklist": [
      "Describe the condition and priority areas rather than choosing only by bedroom count.",
      "Confirm optional appliance or cupboard interiors in the selected scope; deep cleaning does not automatically include every specialist task.",
      "For an empty-property handover, compare move-out cleaning. For ongoing upkeep after the reset, compare regular cleaning."
    ]
  },
  "move-out-cleaning-cape-town": {
    "heading": "Plan cleaning around your property handover",
    "intro": "Move-out cleaning suits empty or nearly empty homes. Match the selected work to the agent's or landlord's checklist before the inspection.",
    "checklist": [
      "Confirm when furniture and belongings will be removed and how the team will obtain access.",
      "Select appliance or cupboard interiors when required rather than assuming they are part of every visit.",
      "Allow time to review the agreed cleaning. A cleaning service does not repair damage or determine a deposit refund."
    ]
  },
  "office-cleaning-cape-town": {
    "heading": "Plan cleaning around your workplace",
    "intro": "Office cleaning needs a workplace checklist and an agreed access window. Describe the work areas, shared kitchens, washrooms and floor surfaces that need attention.",
    "checklist": [
      "Agree visit frequency and timing around occupancy, opening hours and access or security rules.",
      "Identify sensitive equipment, confidential materials and areas cleaners should not enter or handle.",
      "Confirm products, equipment and specialist work in the quote; routine office cleaning is not an IT or server-room deep clean."
    ]
  },
  "airbnb-cleaning-cape-town": {
    "heading": "Plan a guest-ready Airbnb turnover",
    "intro": "Airbnb cleaning is organised around the next guest's arrival. Make access, presentation and any agreed linen tasks clear in the turnover checklist.",
    "checklist": [
      "Provide the usual cleaning products and equipment unless a separate supplies arrangement has been agreed.",
      "Provide checkout and check-in times, entry instructions and a contact for access problems.",
      "Confirm linen handling, guest-consumable locations and restocking tasks instead of assuming every turnover includes them.",
      "Schedule a separate deeper reset when appliance build-up or other detail work goes beyond the agreed turnover scope."
    ]
  },
  "carpet-cleaning-cape-town": {
    "heading": "Confirm the carpet areas and treatment required",
    "intro": "Carpet cleaning is a specialist task. Describe the rooms, carpet condition and access so the proposed work can be assessed before confirmation.",
    "checklist": [
      "Identify stains, odours and known fibre or care-label information; not every mark is removable.",
      "Agree which movable items must be cleared and which carpeted areas are included.",
      "Confirm equipment, treatment and drying guidance with the booked service before planning use of the rooms."
    ]
  },
  "window-cleaning-cape-town": {
    "heading": "Check window access and safe working scope",
    "intro": "Window cleaning depends on the glass, height and safe access available. Describe the property before requesting a specialist quote.",
    "checklist": [
      "Specify interior or exterior glass, the number of openings and any coated or delicate finishes.",
      "Explain access restrictions and building height; rope-access or high-rise facade work is outside the published service scope.",
      "Confirm which frames, tracks or other details are included before the visit."
    ]
  }
};
