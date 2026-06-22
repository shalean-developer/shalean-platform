import { describe, expect, it } from "vitest";
import { renderBrandedEmailFromTemplate } from "@/lib/email/sendTemplateEmail";

const BOOKING_CONFIRMED_INNER = `<h1>Your booking is confirmed ✅</h1>
<p>Hi {{customer_name}}, service {{service_name}} on {{booking_date}}.</p>
<p><strong>Cleaner:</strong> {{cleaner_name}}</p>
<a href="{{account_url}}">View your booking</a>`;

describe("renderBrandedEmailFromTemplate", () => {
  it("wraps booking_confirmed with brand shell and safe defaults", () => {
    const { subject, html } = renderBrandedEmailFromTemplate({
      key: "booking_confirmed",
      content: BOOKING_CONFIRMED_INNER,
      subjectTemplate: "Your booking is confirmed — {{customer_name}}",
      variables: ["customer_name", "service_name", "booking_date", "cleaner_name", "account_url"],
      data: { customer_name: "Alex" },
    });

    expect(subject).toBe("Your booking is confirmed — Alex");
    expect(html).toContain("Shalean");
    expect(html).toContain("Need help?");
    expect(html).toContain("service Not provided");
    expect(html).toContain("Cleaner assignment pending");
    expect(html).not.toContain("Service: ·");
  });
});
