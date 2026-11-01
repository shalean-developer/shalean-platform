import type { ProgrammaticPost } from "./programmaticPosts";
type Service = Exclude<ProgrammaticPost["service"], "local-guide">;
export const PROGRAMMATIC_SERVICE_INTENT: Record<Service, { intro: string; planning: string; checklist: string[] }> = {
  "deep": {
    "intro": "Plan a deep clean around accumulated build-up and the rooms that need detailed attention. Identify those priorities before choosing optional appliance or other extra tasks.",
    "planning": "Preparing for a deep-cleaning visit",
    "checklist": [
      "Describe kitchen grease, bathroom residue and neglected edges so the selected service matches the property's condition.",
      "Clear the surfaces and accessible areas you want cleaned; mention fragile finishes or surfaces needing a particular product.",
      "Check whether oven, fridge or cupboard interiors are selected rather than assuming every detail task is included."
    ]
  },
  "standard": {
    "intro": "Regular cleaning maintains a home that is already reasonably clean. Choose a practical visit frequency and identify the kitchens, bathrooms and floors that need routine attention.",
    "planning": "Preparing for regular home cleaning",
    "checklist": [
      "Choose a schedule based on household use and the cleaning you do between visits; review it after the first appointments.",
      "The customer provides suitable products and equipment by default. Select an available paid supplies option if you need Shalean to bring them.",
      "Keep surfaces accessible and flag heavy build-up that may require a separate deep clean rather than a routine maintenance visit."
    ]
  },
  "airbnb": {
    "intro": "A turnover is planned around the next guest's arrival. Confirm the checkout-to-check-in window, property access and the agreed linen and presentation tasks before booking.",
    "planning": "Preparing for an Airbnb turnover",
    "checklist": [
      "Customers provide the usual cleaning products and equipment unless a separate supplies arrangement has been agreed.",
      "Provide checkout and check-in times, entry instructions and a contact for access problems.",
      "Explain linen handling and where replacement linen and guest consumables are kept; confirm any replenishment or staging tasks separately.",
      "Flag damage, lost items or appliance build-up separately so a routine turnover is not expected to cover repair or a full deep clean."
    ]
  },
  "move-out": {
    "intro": "A move-out clean prepares an empty or nearly empty property for handover. Plan it around furniture removal, access and the agent's or landlord's written checklist.",
    "planning": "Preparing for a move-out handover",
    "checklist": [
      "Arrange removal of belongings and agree how cleaners will get keys and enter the property.",
      "Compare the inspection checklist with the selected rooms and extras, including appliance or cupboard interiors when required.",
      "Allow time to review the agreed cleaning before handover. Cleaning does not repair damage or guarantee a deposit decision."
    ]
  },
  "carpet": {
    "intro": "Carpet cleaning needs its own assessment of the rooms, carpet condition and access. Describe stains and materials without assuming every mark can be removed.",
    "planning": "Preparing for carpet cleaning",
    "checklist": [
      "List the carpeted rooms or areas and describe marks, odours, wear and any known fibre or care-label information.",
      "Agree which movable items need clearing and identify access or electrical-supply constraints before the visit.",
      "Confirm the proposed treatment, equipment and drying guidance with the booked service; drying and stain outcomes depend on conditions."
    ]
  }
};
