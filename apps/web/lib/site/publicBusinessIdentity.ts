/**
 * Public business identity used by customer-facing marketing surfaces and LocalBusiness schema.
 *
 * Source-of-truth policy:
 * - Name, phone, physical address and opening hours mirror the live Google Business Profile.
 * - Public email is site-owned because GBP does not expose an email field.
 */

export const PUBLIC_BUSINESS_NAME = "Shalean Cleaning Services";
export const PUBLIC_BUSINESS_EMAIL = "hello@shalean.co.za";

/** Verified Google Business Profile entity. */
export const PUBLIC_BUSINESS_GOOGLE_PLACE_ID = "ChIJE2azv4FDzB0R6Dif-_0-vn0";
export const PUBLIC_BUSINESS_GOOGLE_PROFILE_URL =
  `https://www.google.com/maps/place/?q=place_id:${PUBLIC_BUSINESS_GOOGLE_PLACE_ID}`;

export const PUBLIC_BUSINESS_ADDRESS = {
  streetAddress: "39 Harvey Rd",
  addressLocality: "Claremont",
  addressRegion: "Western Cape",
  postalCode: "7708",
  addressCountry: "ZA",
} as const;

export const PUBLIC_BUSINESS_ADDRESS_LABEL =
  "39 Harvey Rd, Claremont, Cape Town, 7708, South Africa";

/** Live GBP currently lists the business as open 24 hours every day. */
export const PUBLIC_BUSINESS_OPENING_HOURS = "Mo-Su 00:00-23:59";
export const PUBLIC_BUSINESS_HOURS_LABEL = "Open 24 hours, 7 days a week";

export const PUBLIC_BUSINESS_OPENING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;


export const PUBLIC_BUSINESS_SERVICE_AREA = {
  "@type": "AdministrativeArea",
  name: "Cape Town",
  containedInPlace: {
    "@type": "AdministrativeArea",
    name: "Western Cape",
    containedInPlace: { "@type": "Country", name: "South Africa" },
  },
} as const;

export const PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION = {
  "@type": "OpeningHoursSpecification",
  dayOfWeek: [...PUBLIC_BUSINESS_OPENING_DAYS],
  opens: "00:00",
  closes: "23:59",
} as const;
