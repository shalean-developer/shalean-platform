import { afterEach, describe, expect, it, vi } from "vitest";
import { collectEnvironmentSafetyIssues } from "@/lib/env/assertEnvironmentSafety";
import {
  expectedSupabaseRefForDeployment,
  outboundTestMessageMarker,
  resolveDeploymentEnvironment,
  SHALEAN_SUPABASE_REFS,
  supabaseRefFromUrl,
} from "@/lib/env/deploymentEnvironment";
import {
  applyOutboundSubjectPrefix,
  decideOutboundEmail,
} from "@/lib/env/outboundMessagingSafety";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveDeploymentEnvironment", () => {
  it("prefers SHALEAN_APP_ENV", () => {
    expect(
      resolveDeploymentEnvironment({
        SHALEAN_APP_ENV: "staging",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("maps git branches", () => {
    expect(resolveDeploymentEnvironment({ VERCEL_GIT_COMMIT_REF: "main" })).toBe("production");
    expect(resolveDeploymentEnvironment({ VERCEL_GIT_COMMIT_REF: "staging" })).toBe("staging");
    expect(resolveDeploymentEnvironment({ VERCEL_GIT_COMMIT_REF: "development" })).toBe(
      "development",
    );
  });
});

describe("supabase refs", () => {
  it("parses project ref from URL", () => {
    expect(supabaseRefFromUrl(`https://${SHALEAN_SUPABASE_REFS.production}.supabase.co`)).toBe(
      SHALEAN_SUPABASE_REFS.production,
    );
    expect(supabaseRefFromUrl(`https://${SHALEAN_SUPABASE_REFS.staging}.supabase.co`)).toBe(
      SHALEAN_SUPABASE_REFS.staging,
    );
  });

  it("maps expected refs only for governed remote environments", () => {
    expect(expectedSupabaseRefForDeployment("production")).toBe(SHALEAN_SUPABASE_REFS.production);
    expect(expectedSupabaseRefForDeployment("staging")).toBe(SHALEAN_SUPABASE_REFS.staging);
    expect(expectedSupabaseRefForDeployment("development")).toBeNull();
    expect(expectedSupabaseRefForDeployment("local")).toBeNull();
  });
});

describe("collectEnvironmentSafetyIssues", () => {
  it("rejects live Paystack on staging", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "staging",
      PAYSTACK_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_live_example",
      NEXT_PUBLIC_SUPABASE_URL: `https://${SHALEAN_SUPABASE_REFS.staging}.supabase.co`,
    });
    expect(issues.some((i) => i.code === "paystack_live_in_non_production")).toBe(true);
  });

  it("rejects test Paystack on production", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "production",
      PAYSTACK_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_example",
      NEXT_PUBLIC_SUPABASE_URL: `https://${SHALEAN_SUPABASE_REFS.production}.supabase.co`,
    });
    expect(issues.some((i) => i.code === "paystack_test_in_production")).toBe(true);
  });

  it("rejects wrong Supabase ref for staging", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "staging",
      PAYSTACK_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_example",
      NEXT_PUBLIC_SUPABASE_URL: `https://${SHALEAN_SUPABASE_REFS.production}.supabase.co`,
    });
    expect(issues.some((i) => i.code === "supabase_ref_mismatch")).toBe(true);
  });

  it("rejects remote Supabase for development", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "development",
      PAYSTACK_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_example",
      NEXT_PUBLIC_SUPABASE_URL: `https://${SHALEAN_SUPABASE_REFS.production}.supabase.co`,
    });
    expect(issues.some((i) => i.code === "supabase_remote_in_local_development")).toBe(true);
  });

  it("accepts local Supabase for development", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "development",
      PAYSTACK_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_example",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    });
    expect(issues).toEqual([]);
  });

  it("accepts staging test + staging ref", () => {
    const issues = collectEnvironmentSafetyIssues({
      SHALEAN_APP_ENV: "staging",
      PAYSTACK_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_example",
      NEXT_PUBLIC_SUPABASE_URL: `https://${SHALEAN_SUPABASE_REFS.staging}.supabase.co`,
    });
    expect(issues).toEqual([]);
  });
});

describe("outbound messaging safety", () => {
  it("blocks non-production email without allowlist", () => {
    const d = decideOutboundEmail("customer@example.com", {
      SHALEAN_APP_ENV: "staging",
    });
    expect(d.allowed).toBe(false);
  });

  it("allows allowlisted staging email with marker", () => {
    const d = decideOutboundEmail("qa@shalean.co.za", {
      SHALEAN_APP_ENV: "staging",
      OUTBOUND_EMAIL_ALLOWLIST: "qa@shalean.co.za",
    });
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.subjectPrefix).toBe(outboundTestMessageMarker({ SHALEAN_APP_ENV: "staging" }));
      expect(applyOutboundSubjectPrefix("Hello", d.subjectPrefix)).toContain("STAGING");
    }
  });

  it("does not require allowlist in production", () => {
    const d = decideOutboundEmail("customer@example.com", {
      SHALEAN_APP_ENV: "production",
    });
    expect(d).toEqual({ allowed: true, subjectPrefix: null });
  });
});
