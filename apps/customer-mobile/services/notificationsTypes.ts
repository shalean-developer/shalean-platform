export type PushRegistrationResult =
  | { ok: true; token: string; serverRegistered: boolean }
  | {
      ok: false;
      reason: "web" | "simulator" | "denied" | "unavailable" | "error";
      message?: string;
    };
