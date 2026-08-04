"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAdminData } from "@/hooks/useAdminData";

type PermissionPayload = { permissions?: string[] };

function textEquals(element: Element, expected: string): boolean {
  return element.textContent?.trim().toLowerCase() === expected.toLowerCase();
}

function hideClosest(element: Element | null, selector: string, hidden: boolean) {
  const target = element?.closest<HTMLElement>(selector);
  if (target) target.style.display = hidden ? "none" : "";
}

export function OfficeBookingFinancialVisibilityGate() {
  const pathname = usePathname();
  const { data } = useAdminData<PermissionPayload>("/api/admin/security/my-permissions");
  const canViewCustomerRevenue = data?.permissions?.includes("finance.customer_revenue.view") === true;

  useEffect(() => {
    if (!pathname.startsWith("/office/bookings/")) return;

    const applyVisibility = () => {
      const hidden = !canViewCustomerRevenue;
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));

      for (const element of all) {
        if (textEquals(element, "Payment")) hideClosest(element, ".grid > div", hidden);

        if (element.getAttribute("role") === "tab" && textEquals(element, "Payments")) {
          element.style.display = hidden ? "none" : "";
        }

        if (textEquals(element, "Total (visit)")) hideClosest(element, "div.rounded-xl", hidden);
        if (textEquals(element, "Payment snapshot")) {
          hideClosest(element, "div.rounded-xl, div.rounded-lg, [data-slot='card']", hidden);
        }

        if (textEquals(element, "Mark as Paid") || textEquals(element, "Resend confirmation emails")) {
          hideClosest(element, "button", hidden);
        }

        if (textEquals(element, "View full pricing")) hideClosest(element, "button", hidden);
      }
    };

    applyVisibility();
    const observer = new MutationObserver(applyVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canViewCustomerRevenue, pathname]);

  return null;
}
