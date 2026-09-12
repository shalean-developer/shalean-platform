import { permanentRedirect } from "next/navigation";

/**
 * Legacy UX alias. `/locations` is the single indexable Cape Town location-directory authority.
 * Keep this route as a permanent redirect so existing bookmarks/backlinks consolidate cleanly.
 */
export default function AreasWeServePage() {
  permanentRedirect("/locations");
}
