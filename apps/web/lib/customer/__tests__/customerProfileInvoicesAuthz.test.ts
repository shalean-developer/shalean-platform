import { describe, expect, it } from "vitest";
import { parseCustomerProfilePatchBody } from "@/lib/customer/customerProfileApi";
import { ownsDocumentRow } from "@/lib/customer/documentOwnership";

describe("parseCustomerProfilePatchBody", () => {
  it("maps preferred contact and ignores identity fields if present in parse-only path", () => {
    const patch = parseCustomerProfilePatchBody({
      fullName: "Jane Doe",
      preferredContact: "whatsapp",
      phone: "0821234567",
      email: "hacker@evil.com",
      id: "22222222-2222-4222-8222-222222222222",
    });
    expect(patch.fullName).toBe("Jane Doe");
    expect(patch.preferredContact).toBe("whatsapp");
    expect(patch).not.toHaveProperty("email");
    expect(patch).not.toHaveProperty("id");
  });

  it("accepts snake_case aliases", () => {
    const patch = parseCustomerProfilePatchBody({
      full_name: "Jane",
      preferred_contact: "phone",
      date_of_birth: "1990-01-02",
    });
    expect(patch.fullName).toBe("Jane");
    expect(patch.preferredContact).toBe("phone");
    expect(patch.dateOfBirth).toBe("1990-01-02");
  });
});

describe("invoice ownership denied cases", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("denies booking PDF when ownerId is another user", () => {
    expect(
      ownsDocumentRow(
        { ownerId: other, ownerEmail: "me@example.com" },
        { id: owner, email: "me@example.com" },
      ),
    ).toBe(false);
  });

  it("allows booking PDF when ownerId matches", () => {
    expect(
      ownsDocumentRow(
        { ownerId: owner, ownerEmail: "other@example.com" },
        { id: owner, email: "me@example.com" },
      ),
    ).toBe(true);
  });
});
