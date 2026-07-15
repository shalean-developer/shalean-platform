#!/usr/bin/env node
/**
 * PRINCESS-UAT-PRB — Staging auth/session/authorization probe.
 * Does not print secrets/tokens. Production project is read-only identity check only.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const STAGING_REF = "gbgnemlpyykyhpqqbgru";
const PRODUCTION_REF = "tchayecuvzssixyxlvfu";
const STAGING_URL =
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app";
const PRODUCTION_HOSTS = new Set(["shalean.co.za", "www.shalean.co.za"]);

const PRINCESS = "info@shalean.com";
const CONTROL = "staging-admin@shalean.test";
const CUSTOMER = "staging-customer@shalean.test";
const CLEANER = "staging-cleaner@shalean.test";

const ADMIN_APIS = [
  "/api/admin/teams",
  "/api/admin/dashboard-stats",
  "/api/admin/ops-snapshot",
];
const CUSTOMER_API = "/api/customer/profile";
const CLEANER_API = "/api/cleaner/me";

function loadEnvFile(path) {
  const map = {};
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[m[1]] = v;
  }
  return map;
}

function loadKeys(env) {
  return loadEnvFile(
    resolve(root, "docs/audits/environments/evidence/.secrets-local", `${env}.keys.env`),
  );
}

function loadPasswords() {
  return loadEnvFile(
    resolve(
      root,
      "docs/audits/environments/evidence/.secrets-local/staging.synthetic-passwords.env",
    ),
  );
}

function loadBypass() {
  const p = resolve(
    root,
    "docs/audits/environments/evidence/.secrets-local/vercel-automation-bypass.token",
  );
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8").trim();
}

async function timed(fn) {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

async function signIn(url, anon, email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message, ms: 0 };
  return {
    ok: true,
    accessToken: data.session?.access_token ?? null,
    userId: data.user?.id ?? null,
    email: data.user?.email ?? email,
    client,
    session: data.session,
  };
}

async function fetchJson(path, { token, bypass, method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html redirect pages */
  }
  return {
    status: res.status,
    location: res.headers.get("location"),
    json,
    error: json?.error ?? null,
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  const stagingKeys = loadKeys("staging");
  const passwords = loadPasswords();
  const bypass = loadBypass();
  const url = `https://${STAGING_REF}.supabase.co`;
  const anon = stagingKeys.SUPABASE_ANON_KEY || stagingKeys.SUPABASE_PUBLISHABLE_KEY;
  const service = stagingKeys.SUPABASE_SERVICE_ROLE_KEY;

  const evidence = {
    task: "PRINCESS-UAT-PRB",
    timestamp: new Date().toISOString(),
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    stagingUrl: STAGING_URL,
    health: null,
    login: {},
    passwordReset: {},
    authz: {},
    productionNonImpact: {},
    pass: false,
  };

  if (!anon || !service || !bypass) {
    evidence.error = "Missing staging keys or bypass token in .secrets-local";
    writeEvidence(evidence);
    console.error(JSON.stringify({ pass: false, error: evidence.error }, null, 2));
    process.exit(1);
  }

  const health = await timed(() => fetchJson("/api/health/environment", { bypass }));
  evidence.health = {
    status: health.value.status,
    ms: health.ms,
    body: health.value.json,
  };

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Login timings + role resolve ---
  for (const [label, email] of [
    ["princess", PRINCESS],
    ["controlAdmin", CONTROL],
    ["customer", CUSTOMER],
    ["cleaner", CLEANER],
  ]) {
    const password = passwords[email];
    if (!password) {
      evidence.login[label] = { ok: false, error: "password missing in secrets-local" };
      continue;
    }
    const authTimed = await timed(() => signIn(url, anon, email, password));
    const auth = authTimed.value;
    if (!auth.ok) {
      evidence.login[label] = { ok: false, error: auth.error, authMs: authTimed.ms };
      continue;
    }
    const profileTimed = await timed(() =>
      fetchJson("/api/auth/resolve-profile", {
        bypass,
        method: "POST",
        body: { access_token: auth.accessToken },
      }),
    );
    evidence.login[label] = {
      ok: true,
      authMs: authTimed.ms,
      resolveProfileMs: profileTimed.ms,
      resolveStatus: profileTimed.value.status,
      role: profileTimed.value.json?.role ?? null,
      dashboardRoute: profileTimed.value.json?.dashboardRoute ?? null,
      userId: auth.userId,
      accessToken: undefined,
    };
    // stash token privately on object for later matrix (stripped before write)
    evidence.login[label]._token = auth.accessToken;
    evidence.login[label]._client = auth.client;
  }

  // Invalid credentials
  const bad = await timed(() => signIn(url, anon, CUSTOMER, "definitely-wrong-password-xxx"));
  evidence.login.invalidCredentials = {
    ok: !bad.value.ok,
    error: bad.value.error ?? null,
    ms: bad.ms,
  };

  // --- Password reset link host (no password change) ---
  const resetEmail = CUSTOMER;
  const redirectTo = `${STAGING_URL}/auth/reset-password`;
  const linkTimed = await timed(() =>
    admin.auth.admin.generateLink({
      type: "recovery",
      email: resetEmail,
      options: { redirectTo },
    }),
  );
  const actionLink = linkTimed.value.data?.properties?.action_link ?? "";
  const actionHost = hostOf(actionLink);
  const redirectParam = (() => {
    try {
      return new URL(actionLink).searchParams.get("redirect_to");
    } catch {
      return null;
    }
  })();
  const redirectHost = redirectParam ? hostOf(redirectParam) : null;
  evidence.passwordReset = {
    generateLinkMs: linkTimed.ms,
    generateOk: !linkTimed.value.error,
    actionHost,
    redirectHost,
    redirectToConfigured: redirectTo,
    pointsOnlyToStaging:
      Boolean(actionHost) &&
      !PRODUCTION_HOSTS.has(actionHost) &&
      (!redirectHost || !PRODUCTION_HOSTS.has(redirectHost)),
    productionLeak: Boolean(
      (actionHost && PRODUCTION_HOSTS.has(actionHost)) ||
        (redirectHost && PRODUCTION_HOSTS.has(redirectHost)),
    ),
  };

  // Forgot-password API on a different mailbox so it does not collide with generateLink rate limits.
  const forgotEmail = CONTROL;
  const forgot = await timed(() =>
    fetchJson("/api/auth/forgot-password", {
      bypass,
      method: "POST",
      body: { email: forgotEmail },
    }),
  );
  evidence.passwordReset.forgotApi = {
    email: forgotEmail,
    status: forgot.value.status,
    ms: forgot.ms,
    sent: forgot.value.json?.sent ?? null,
    code: forgot.value.json?.code ?? null,
    error: forgot.value.error,
  };

  // --- Authz matrix ---
  const unauthAccount = await fetchJson("/account", { bypass });
  evidence.authz.unauthenticatedAccount = {
    status: unauthAccount.status,
    location: unauthAccount.location,
    redirectsToLogin:
      unauthAccount.status === 307 ||
      unauthAccount.status === 302 ||
      (unauthAccount.location || "").includes("/login"),
  };

  async function matrixFor(label, apis) {
    const token = evidence.login[label]?._token;
    if (!token) return { skipped: true };
    const out = {};
    for (const path of apis) {
      const res = await fetchJson(path, { token, bypass });
      out[path] = { status: res.status, error: res.error };
    }
    return out;
  }

  evidence.authz.princess = await matrixFor("princess", [...ADMIN_APIS, CUSTOMER_API, CLEANER_API]);
  evidence.authz.customer = await matrixFor("customer", [...ADMIN_APIS, CUSTOMER_API, CLEANER_API]);
  evidence.authz.cleaner = await matrixFor("cleaner", [...ADMIN_APIS, CUSTOMER_API, CLEANER_API]);

  // Session revoke / refresh
  const customerClient = evidence.login.customer?._client;
  if (customerClient && evidence.login.customer?._token) {
    const before = await fetchJson(CUSTOMER_API, {
      token: evidence.login.customer._token,
      bypass,
    });
    await customerClient.auth.signOut({ scope: "global" });
    const after = await fetchJson(CUSTOMER_API, {
      token: evidence.login.customer._token,
      bypass,
    });
    evidence.authz.revokedSession = {
      beforeStatus: before.status,
      afterStatus: after.status,
      afterError: after.error,
      deniesAfterRevoke: after.status === 401,
    };
  }

  // Production non-impact: ensure we did not use production ref for writes
  evidence.productionNonImpact = {
    stagingKeysRef: STAGING_REF,
    productionRefUntouched: PRODUCTION_REF,
    passwordResetProductionLeak: evidence.passwordReset.productionLeak === true,
  };

  // Strip secrets before write
  for (const key of Object.keys(evidence.login)) {
    if (evidence.login[key] && typeof evidence.login[key] === "object") {
      delete evidence.login[key]._token;
      delete evidence.login[key]._client;
    }
  }

  const loginOk =
    evidence.login.princess?.ok &&
    evidence.login.customer?.ok &&
    evidence.login.cleaner?.ok &&
    evidence.login.invalidCredentials?.ok;
  const resetOk =
    evidence.passwordReset.generateOk &&
    evidence.passwordReset.pointsOnlyToStaging &&
    !evidence.passwordReset.productionLeak;
  const authzOk =
    evidence.authz.unauthenticatedAccount?.redirectsToLogin &&
    evidence.authz.princess?.["/api/admin/teams"]?.status === 200 &&
    evidence.authz.customer?.["/api/admin/teams"]?.status === 403 &&
    evidence.authz.cleaner?.["/api/admin/teams"]?.status === 403 &&
    (evidence.authz.revokedSession?.deniesAfterRevoke ?? true);

  evidence.pass = Boolean(loginOk && resetOk && authzOk && evidence.health?.status === 200);
  writeEvidence(evidence);

  console.log(
    JSON.stringify(
      {
        pass: evidence.pass,
        loginMs: {
          princessAuth: evidence.login.princess?.authMs,
          princessResolve: evidence.login.princess?.resolveProfileMs,
          customerAuth: evidence.login.customer?.authMs,
          customerResolve: evidence.login.customer?.resolveProfileMs,
        },
        passwordReset: {
          pointsOnlyToStaging: evidence.passwordReset.pointsOnlyToStaging,
          forgotApiStatus: evidence.passwordReset.forgotApi?.status,
        },
        authz: {
          adminTeamsPrincess: evidence.authz.princess?.["/api/admin/teams"]?.status,
          adminTeamsCustomer: evidence.authz.customer?.["/api/admin/teams"]?.status,
          revokedDenies: evidence.authz.revokedSession?.deniesAfterRevoke,
        },
      },
      null,
      2,
    ),
  );
  process.exit(evidence.pass ? 0 : 2);
}

function writeEvidence(evidence) {
  const dir = resolve(root, "docs/audits/uat/princess/evidence");
  mkdirSync(dir, { recursive: true });
  const stamp = evidence.timestamp.replace(/[:.]/g, "").replace("T", "T").slice(0, 16);
  const path = resolve(dir, `prb-auth-staging-probe-${stamp}Z.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  evidence._evidencePath = path;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
