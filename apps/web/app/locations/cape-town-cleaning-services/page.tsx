import { permanentRedirect } from "next/navigation";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH } from "@/lib/seo/capeTownLocations";

/** Legacy URL — consolidated on the marketing city hub for clearer commercial intent. */
export default function LegacyCapeTownCleaningServicesRedirect() {
  permanentRedirect(CAPE_TOWN_LOCATIONS_OVERVIEW_PATH);
}
