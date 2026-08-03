import { describe, expect, it, vi } from "vitest";
import { getEffectiveAdminScope } from "./effectiveAdminScope";

describe("getEffectiveAdminScope", () => {
  it("normalizes an owner wildcard scope", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        userId: "user-1",
        isOwner: true,
        roles: ["owner"],
        permissions: ["role.manage", "payout.release"],
        branches: ["*"],
        teams: ["*"],
        resolvedAt: "2026-08-03T16:00:00.000Z",
      },
      error: null,
    });

    const result = await getEffectiveAdminScope({ rpc } as never, "user-1");

    expect(result.error).toBeNull();
    expect(result.scope).toEqual({
      userId: "user-1",
      isOwner: true,
      roles: ["owner"],
      permissions: ["role.manage", "payout.release"],
      branches: ["*"],
      teams: ["*"],
      resolvedAt: "2026-08-03T16:00:00.000Z",
    });
  });

  it("fails closed when the scope RPC fails", async () => {
    const error = { code: "42883", message: "function missing" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });

    const result = await getEffectiveAdminScope({ rpc } as never, "user-2");

    expect(result.scope).toBeNull();
    expect(result.error).toBe(error);
  });
});
