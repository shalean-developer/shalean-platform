import type { Metadata } from "next";
import { pageTitleEnvironmentSuffix } from "@/lib/env/deploymentEnvironment";
import {
  HOME_CANONICAL,
  HOME_OPEN_GRAPH,
  HOME_PAGE_META_DESCRIPTION,
  HOME_TWITTER,
} from "@/lib/seo/homePageMeta";
import { metadataBaseUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW, SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";

function googleSiteVerification(): Metadata["verification"] | undefined {
  const token = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  if (!token) return undefined;
  return { google: token };
}

const verification = googleSiteVerification();
const envSuffix = pageTitleEnvironmentSuffix();
const defaultTitle = envSuffix
  ? `Shalean Cleaning Services [${envSuffix}]`
  : "Shalean Cleaning Services";

/** Root layout metadata — default OG/Twitter fallbacks for pages that omit their own. */
export const ROOT_METADATA: Metadata = {
  metadataBase: metadataBaseUrl(),
  robots: envSuffix ? SEO_NOINDEX_FOLLOW : SEO_INDEX_FOLLOW,
  title: {
    default: defaultTitle,
    template: envSuffix ? `%s | ${envSuffix}` : "%s",
  },
  description: HOME_PAGE_META_DESCRIPTION,
  manifest: "/site.webmanifest",
  alternates: { canonical: HOME_CANONICAL },
  openGraph: HOME_OPEN_GRAPH,
  twitter: HOME_TWITTER,
  ...(verification ? { verification } : {}),
};
