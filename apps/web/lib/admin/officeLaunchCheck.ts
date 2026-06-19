import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLaunchCheckSetupHints,
  isLaunchCheckConfigReady,
  isLaunchCheckEnabled,
  readLaunchCheckConfig,
} from "@/lib/launch/launchCheckConfig";
import { OFFICE_PLACEHOLDER_PAGES } from "@/lib/launch/mockDataAudit";
import type { OfficeLaunchCheckStatus } from "@/lib/launch/types";

export async function buildOfficeLaunchCheckStatus(
  admin: SupabaseClient | null,
  options: {
    requestingAdminUserId?: string | null;
    requestingAdminEmail?: string | null;
    fetchedAt?: string;
  } = {},
): Promise<OfficeLaunchCheckStatus> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const enabled = isLaunchCheckEnabled();

  if (!admin) {
    return {
      enabled,
      fetchedAt,
      config: {
        customerUserId: null,
        cleanerId: null,
        cleanerUserId: null,
        adminUserId: null,
        adminEmail: options.requestingAdminEmail ?? null,
        sources: {
          customerUserId: "missing",
          cleanerId: "missing",
          cleanerUserId: "missing",
          adminUserId: "missing",
        },
      },
      configReady: false,
      placeholderPages: OFFICE_PLACEHOLDER_PAGES,
      placeholderCount: OFFICE_PLACEHOLDER_PAGES.length,
      setupHints: ["Server missing SUPABASE_SERVICE_ROLE_KEY."],
    };
  }

  const config = await readLaunchCheckConfig(admin, {
    requestingAdminUserId: options.requestingAdminUserId,
    requestingAdminEmail: options.requestingAdminEmail,
  });

  return {
    enabled,
    fetchedAt,
    config,
    configReady: isLaunchCheckConfigReady(config),
    placeholderPages: OFFICE_PLACEHOLDER_PAGES,
    placeholderCount: OFFICE_PLACEHOLDER_PAGES.length,
    setupHints: buildLaunchCheckSetupHints(config),
  };
}
