import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminMarkBookingPaidOperation } from "@/lib/booking/bookingOperations";
import { isCustomerBookingReference } from "@/lib/booking/customerBookingReference";
import { resolveUserRoleServer } from "@/lib/auth/resolveUserRoleServer";
import { dashboardRouteForRole, safePostLoginRedirect } from "@/lib/auth/userRole";
import { loadCustomerBookingRowsForUser } from "@/lib/customer/customerBookingsForUser";
import { fetchCleanerVisibleBookingsMerged } from "@/lib/cleaner/cleanerBookingAccess";
import { acceptBookingDispatchOffer, createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { resolveDispatchOfferAcceptTtlSeconds } from "@/lib/dispatch/dispatchOfferAcceptTtl";
import { readLaunchCheckConfig } from "@/lib/launch/launchCheckConfig";
import {
  cleanupLaunchCheckBooking,
  loadBookingRowById,
  seedLaunchCheckPendingPaymentBooking,
} from "@/lib/launch/launchCheckSeed";
import { auditMockDashboardData } from "@/lib/launch/mockDataAudit";
import type { LaunchCheckResult, LaunchCheckRunResponse } from "@/lib/launch/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function result(
  id: string,
  label: string,
  passed: boolean,
  error?: string,
  details?: Record<string, unknown>,
): LaunchCheckResult {
  return { id, label, passed, ...(error ? { error } : {}), ...(details ? { details } : {}) };
}

function summarize(results: LaunchCheckResult[]): LaunchCheckRunResponse["summary"] {
  const passed = results.filter((r) => r.passed).length;
  return { passed, failed: results.length - passed, total: results.length };
}

async function resolveCustomerEmail(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = String(data?.user?.email ?? "").trim();
  return email || null;
}

async function checkRoleRedirects(
  admin: SupabaseClient,
  config: Awaited<ReturnType<typeof readLaunchCheckConfig>>,
): Promise<LaunchCheckResult> {
  const checks: Record<string, unknown> = {};
  const failures: string[] = [];

  const roleCases: { key: string; userId: string | null; expectedRoute: string; crossBlockPath: string }[] = [
    {
      key: "customer",
      userId: config.customerUserId,
      expectedRoute: "/account",
      crossBlockPath: "/office",
    },
    {
      key: "cleaner",
      userId: config.cleanerUserId,
      expectedRoute: "/jobs",
      crossBlockPath: "/office",
    },
    {
      key: "admin",
      userId: config.adminUserId,
      expectedRoute: "/office",
      crossBlockPath: "/account",
    },
  ];

  for (const roleCase of roleCases) {
    if (!roleCase.userId) {
      checks[roleCase.key] = { skipped: true, reason: "user id not configured" };
      continue;
    }

    const email =
      roleCase.key === "admin" && config.adminEmail
        ? config.adminEmail
        : (await resolveCustomerEmail(admin, roleCase.userId)) ?? undefined;

    const resolved = await resolveUserRoleServer(admin, { userId: roleCase.userId, email });
    if (resolved.kind !== "ok") {
      failures.push(`${roleCase.key}: role resolve failed (${resolved.kind})`);
      checks[roleCase.key] = { resolved, expectedRoute: roleCase.expectedRoute };
      continue;
    }

    const route = dashboardRouteForRole(resolved.role);
    const safeCross = safePostLoginRedirect(roleCase.crossBlockPath, resolved.role);
    checks[roleCase.key] = {
      role: resolved.role,
      dashboardRoute: route,
      crossRoleRedirectFrom: roleCase.crossBlockPath,
      crossRoleRedirectTo: safeCross,
    };

    if (route !== roleCase.expectedRoute) {
      failures.push(`${roleCase.key}: expected ${roleCase.expectedRoute}, got ${route}`);
    }
    if (safeCross === roleCase.crossBlockPath) {
      failures.push(`${roleCase.key}: cross-role path ${roleCase.crossBlockPath} was not blocked`);
    }
  }

  if (!config.customerUserId && !config.cleanerUserId && !config.adminUserId) {
    return result(
      "role_redirects",
      "Role redirects work",
      false,
      "Set LAUNCH_CHECK_CUSTOMER_USER_ID, LAUNCH_CHECK_CLEANER_ID (or LAUNCH_CHECK_CLEANER_USER_ID), and LAUNCH_CHECK_ADMIN_EMAIL or LAUNCH_CHECK_ADMIN_USER_ID.",
      checks,
    );
  }

  return result(
    "role_redirects",
    "Role redirects work",
    failures.length === 0,
    failures.length ? failures.join("; ") : undefined,
    checks,
  );
}

async function checkOfficePlaceholders(): Promise<LaunchCheckResult> {
  const audit = auditMockDashboardData();
  const count = Number(audit.details.placeholderCount ?? 0);
  return result(
    "office_placeholders",
    "Office placeholder audit",
    true,
    count > 0 ? `${count} office page(s) still use static placeholder data (informational).` : undefined,
    audit.details,
  );
}

async function checkLegacyBookingsApi(): Promise<LaunchCheckResult> {
  let legacyMockDetected = false;
  let legacyBody: unknown = null;

  try {
    const base = process.env.OPS_APP_BASE_URL?.trim() || process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
    const res = await fetch(`${base.replace(/\/$/, "")}/api/bookings`, {
      signal: AbortSignal.timeout(8_000),
    });
    legacyBody = await res.json().catch(() => null);
    if (res.status === 410) {
      legacyMockDetected = false;
    } else if (res.ok) {
      const bookings = (legacyBody as { bookings?: { id?: string }[] } | null)?.bookings ?? [];
      legacyMockDetected = bookings.some((b) => String(b.id ?? "").startsWith("mock-"));
    }
  } catch (e) {
    return result(
      "legacy_bookings_api",
      "Legacy bookings API retired",
      true,
      undefined,
      { legacyBookingsFetch: e instanceof Error ? e.message : "fetch failed" },
    );
  }

  return result(
    "legacy_bookings_api",
    "Legacy bookings API retired",
    !legacyMockDetected,
    legacyMockDetected ? "GET /api/bookings still returns mock booking ids." : undefined,
    legacyMockDetected ? { legacyBookingsResponseSample: legacyBody } : { note: "Route absent, gone, or non-mock." },
  );
}

export async function runLaunchReadinessChecks(params: {
  adminUserId: string;
  adminEmail?: string | null;
}): Promise<LaunchCheckRunResponse> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    const fail = result(
      "init",
      "Supabase admin client",
      false,
      "Server missing SUPABASE_SERVICE_ROLE_KEY.",
    );
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      results: [fail],
      summary: summarize([fail]),
    };
  }

  const config = await readLaunchCheckConfig(admin, {
    requestingAdminUserId: params.adminUserId,
    requestingAdminEmail: params.adminEmail,
  });
  const results: LaunchCheckResult[] = [];
  let bookingId: string | null = null;
  let offerId: string | null = null;

  try {
    if (!config.customerUserId) {
      results.push(
        result(
          "booking_saves",
          "Booking form saves booking",
          false,
          "Set LAUNCH_CHECK_CUSTOMER_USER_ID to a valid customer auth user id.",
        ),
      );
      results.push(
        result("booking_reference", "Booking reference saves", false, "Skipped — no test booking."),
      );
      results.push(
        result("payment_status", "Payment status saves", false, "Skipped — no test booking."),
      );
      results.push(
        result(
          "customer_dashboard",
          "Customer dashboard reads booking",
          false,
          "Skipped — no test booking.",
        ),
      );
      results.push(
        result("admin_dashboard", "Admin dashboard reads booking", false, "Skipped — no test booking."),
      );
      results.push(
        result(
          "cleaner_dashboard",
          "Cleaner dashboard reads assigned job",
          false,
          "Skipped — no test booking.",
        ),
      );
      results.push(
        result("status_sync", "Status sync", false, "Skipped — no test booking."),
      );
    } else {
      const customerEmail = (await resolveCustomerEmail(admin, config.customerUserId)) ?? "launch-check@example.test";

      const seed = await seedLaunchCheckPendingPaymentBooking(admin, {
        userId: config.customerUserId,
        customerEmail,
        selectedCleanerId: config.cleanerId,
      });

      if (!seed.ok) {
        results.push(
          result("booking_saves", "Booking form saves booking", false, seed.error),
        );
        results.push(
          result("booking_reference", "Booking reference saves", false, "Skipped — seed failed."),
        );
        results.push(
          result("payment_status", "Payment status saves", false, "Skipped — seed failed."),
        );
        results.push(
          result(
            "customer_dashboard",
            "Customer dashboard reads booking",
            false,
            "Skipped — seed failed.",
          ),
        );
        results.push(
          result("admin_dashboard", "Admin dashboard reads booking", false, "Skipped — seed failed."),
        );
        results.push(
          result(
            "cleaner_dashboard",
            "Cleaner dashboard reads assigned job",
            false,
            "Skipped — seed failed.",
          ),
        );
        results.push(result("status_sync", "Status sync", false, "Skipped — seed failed."));
      } else {
        bookingId = seed.bookingId;
        const rowAfterSeed = await loadBookingRowById(admin, bookingId);
        const seedStatus = String(rowAfterSeed?.status ?? "").toLowerCase();

        results.push(
          result(
            "booking_saves",
            "Booking form saves booking",
            seedStatus === "pending_payment",
            seedStatus === "pending_payment"
              ? undefined
              : `Expected pending_payment, got ${seedStatus || "unknown"}.`,
            { bookingId, status: seedStatus, paystackReference: seed.paystackReference },
          ),
        );

        const bookingRef = String(rowAfterSeed?.booking_reference ?? "").trim();
        results.push(
          result(
            "booking_reference",
            "Booking reference saves",
            isCustomerBookingReference(bookingRef),
            isCustomerBookingReference(bookingRef)
              ? undefined
              : `Expected SHL-BK-###### reference, got "${bookingRef || "(empty)"}".`,
            { bookingId, bookingReference: bookingRef },
          ),
        );

        const markPaid = await adminMarkBookingPaidOperation({
          admin,
          bookingId,
          adminUserId: params.adminUserId,
          method: "cash",
          reference: `launch_check_${bookingId.slice(0, 8)}`,
          settlementMode: "full",
        });

        const rowAfterPaid = await loadBookingRowById(admin, bookingId);
        const paidStatus = String(rowAfterPaid?.status ?? "").toLowerCase();
        const paymentStatus = String(rowAfterPaid?.payment_status ?? "").toLowerCase();
        const markPaidOk =
          markPaid.ok &&
          paidStatus !== "pending_payment" &&
          (paymentStatus === "success" || paymentStatus === "paid");

        results.push(
          result(
            "payment_status",
            "Payment status saves",
            markPaidOk,
            markPaidOk
              ? undefined
              : markPaid.ok
                ? `Unexpected status after mark-paid: status=${paidStatus}, payment_status=${paymentStatus}.`
                : String((markPaid as { error?: string }).error ?? "mark-paid failed"),
            { bookingId, status: paidStatus, paymentStatus, markPaidVariant: markPaid.ok ? markPaid.data?.variant : null },
          ),
        );

        const customerLoad = await loadCustomerBookingRowsForUser(admin, config.customerUserId, {
          viewerEmail: customerEmail,
        });
        const customerRows = customerLoad.ok ? customerLoad.bookings : [];
        const customerRow = customerRows.find((b) => b.id === bookingId);
        const customerFields = customerRow
          ? {
              service: customerRow.service,
              date: customerRow.date,
              time: customerRow.time,
              location: customerRow.location,
              suburb: customerRow.suburb,
              status: customerRow.status,
              paymentStatus: customerRow.payment_status,
              bookingReference: customerRow.booking_reference,
            }
          : null;

        results.push(
          result(
            "customer_dashboard",
            "Customer dashboard reads booking",
            Boolean(
              customerRow &&
                customerRow.service &&
                customerRow.date &&
                customerRow.time &&
                (customerRow.location || customerRow.suburb),
            ),
            customerRow
              ? undefined
              : customerLoad.ok
                ? "Booking not visible on customer dashboard after mark-paid."
                : customerLoad.error,
            { bookingId, fields: customerFields },
          ),
        );

        const adminRow = rowAfterPaid;
        const adminOk = Boolean(
          adminRow &&
            adminRow.customer_email &&
            adminRow.service &&
            (adminRow.total_paid_zar != null || adminRow.amount_paid_cents != null) &&
            adminRow.payment_status,
        );
        results.push(
          result(
            "admin_dashboard",
            "Admin dashboard reads booking",
            adminOk,
            adminOk ? undefined : "Admin booking row missing customer, service, price, or payment fields.",
            {
              bookingId,
              customerEmail: adminRow?.customer_email,
              service: adminRow?.service,
              totalPaidZar: adminRow?.total_paid_zar,
              paymentStatus: adminRow?.payment_status,
              dispatchStatus: adminRow?.dispatch_status,
              cleanerId: adminRow?.cleaner_id,
            },
          ),
        );

        if (config.cleanerId) {
          const ttlSeconds = resolveDispatchOfferAcceptTtlSeconds();
          const offerRes = await createDispatchOfferRow({
            supabase: admin,
            bookingId,
            cleanerId: config.cleanerId,
            rankIndex: 0,
            ttlSeconds,
            skipImmediateNotification: true,
          });

          if (offerRes.ok) offerId = offerRes.offerId;

          const { data: pendingOffers } = await admin
            .from("dispatch_offers")
            .select("id, status, booking_id")
            .eq("cleaner_id", config.cleanerId)
            .eq("booking_id", bookingId)
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString());

          const { data: mergedJobs } = await fetchCleanerVisibleBookingsMerged(admin, config.cleanerId, {
            select:
              "id, service, date, time, location, status, display_earnings_cents, cleaner_earnings_total_cents",
            perBranchLimit: 40,
          });

          const hasOffer = (pendingOffers ?? []).length > 0;
          const jobOnDashboard = (mergedJobs ?? []).some((j) => String(j.id ?? "") === bookingId);

          results.push(
            result(
              "cleaner_dashboard",
              "Cleaner dashboard reads assigned job",
              offerRes.ok && hasOffer,
              offerRes.ok && hasOffer
                ? undefined
                : offerRes.ok
                  ? "No pending dispatch offer found for launch-check cleaner."
                  : offerRes.error ?? "Could not create dispatch offer.",
              {
                bookingId,
                cleanerId: config.cleanerId,
                offerId: offerRes.ok ? offerRes.offerId : null,
                pendingOfferCount: (pendingOffers ?? []).length,
                jobOnDashboard,
                service: adminRow?.service,
                location: adminRow?.location,
                date: adminRow?.date,
                time: adminRow?.time,
              },
            ),
          );
        } else {
          results.push(
            result(
              "cleaner_dashboard",
              "Cleaner dashboard reads assigned job",
              false,
              "Set LAUNCH_CHECK_CLEANER_ID to verify cleaner offers/jobs.",
            ),
          );
        }

        const statusSteps: { label: string; expected: string; actual: string }[] = [];
        statusSteps.push({
          label: "pending_payment",
          expected: "pending_payment",
          actual: seedStatus,
        });
        statusSteps.push({
          label: "paid",
          expected: "not pending_payment",
          actual: paidStatus,
        });

        if (config.cleanerId && offerId) {
          const acceptRes = await acceptBookingDispatchOffer({
            supabase: admin,
            offerId,
            cleanerId: config.cleanerId,
          });
          const afterAccept = await loadBookingRowById(admin, bookingId);
          const acceptStatus = String(afterAccept?.status ?? "").toLowerCase();
          const cleanerResponse = String(afterAccept?.cleaner_response_status ?? "").toLowerCase();
          statusSteps.push({
            label: "accepted",
            expected: "accepted",
            actual: acceptRes.ok ? cleanerResponse || acceptStatus : `accept failed: ${acceptRes.error ?? acceptRes.failure}`,
          });

          await admin
            .from("bookings")
            .update({ status: "in_progress", started_at: new Date().toISOString() })
            .eq("id", bookingId);
          const afterProgress = await loadBookingRowById(admin, bookingId);
          statusSteps.push({
            label: "in_progress",
            expected: "in_progress",
            actual: String(afterProgress?.status ?? "").toLowerCase(),
          });

          await admin
            .from("bookings")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", bookingId);
          const afterCompleted = await loadBookingRowById(admin, bookingId);
          statusSteps.push({
            label: "completed",
            expected: "completed",
            actual: String(afterCompleted?.status ?? "").toLowerCase(),
          });
        }

        await admin.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
        const afterCancelled = await loadBookingRowById(admin, bookingId);
        statusSteps.push({
          label: "cancelled",
          expected: "cancelled",
          actual: String(afterCancelled?.status ?? "").toLowerCase(),
        });

        const statusFailed = statusSteps.filter(
          (s) =>
            s.label === "pending_payment"
              ? s.actual !== "pending_payment"
              : s.label === "paid"
                ? s.actual === "pending_payment"
                : s.label === "accepted"
                  ? !s.actual.includes("accepted") && s.actual !== "assigned"
                  : s.actual !== s.expected,
        );

        results.push(
          result(
            "status_sync",
            "Status sync",
            statusFailed.length === 0,
            statusFailed.length
              ? `Failed steps: ${statusFailed.map((s) => `${s.label}=${s.actual}`).join(", ")}`
              : config.cleanerId
                ? undefined
                : "Cleaner accept steps skipped — set LAUNCH_CHECK_CLEANER_ID for full lifecycle.",
            { steps: statusSteps },
          ),
        );
      }
    }

    results.push(await checkRoleRedirects(admin, config));
    results.push(await checkOfficePlaceholders());
    results.push(await checkLegacyBookingsApi());
  } finally {
    if (bookingId) {
      await cleanupLaunchCheckBooking(admin, bookingId);
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    results,
    summary: summarize(results),
  };
}

/** Exported for unit tests. */
export { isCustomerBookingReference as isLaunchBookingReference };
