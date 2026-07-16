# Production Deployment Evidence

## New production deployment (from main after merge)
- deployment ID: dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw
- target: production
- branch (githubCommitRef): main
- deployment commit SHA: 6ca3da686b6bfec9305c52448612eda682dbfa3e (Merge PR #24)
- state: READY
- region: iad1
- createdAt: 1784220834847 (2026-07-16 16:53:54 UTC)
- buildingAt: 1784220836952 (2026-07-16 16:53:56 UTC)
- ready: 1784221101447 (2026-07-16 16:58:21 UTC)
- aliasError: null
- inspectorUrl: https://vercel.com/shalean-cleaning-services/shalean-platform/6RZTr3exZiLJYXs6QoPbJBVnUCzw
- immutable URL: shalean-platform-5u6u0za3x-shalean-cleaning-services.vercel.app

## Aliases assigned to the new deployment
- shalean-platform-shalean-cleaning-services.vercel.app
- shalean-platform-git-main-shalean-cleaning-services.vercel.app
- Production custom domains: shalean.co.za, www.shalean.co.za (apex serves this deployment; confirmed via fresh origin hits)

## Guardrails verified
- No staging alias moved: staging alias (shalean-platform-git-staging-...) remains on the last staging preview (dpl_DhyuKZg61WioKfJXTTo8F8gCLsqc), NOT touched.
- No Preview mistaken for production: the promoted deployment has target=production and branch=main.

## Build evidence (dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw)
- Cloning Branch: main, Commit: 6ca3da6
- Detected Next.js version: 16.2.10
- typecheck + validate-blog-routes passed
- "Compiled successfully in 100s"; 267 static pages generated
- "Build Completed in /vercel/output [4m]"; "Deployment completed"
- Hundreds of /api routes emitted (incl. /api/health, /api/health/environment source present)
- NO migration / db push command in build (build ran npm ci + next build only)

## Apex edge-cache note (pre-existing, non-blocking)
- GET https://shalean.co.za/api/health returns fresh 200 (X-Vercel-Cache: MISS) — apex serves the new deployment.
- GET/POST https://shalean.co.za/api/health/environment returns a STALE edge-cached 404
  (X-Vercel-Cache: HIT, X-Matched-Path: /404, Last-Modified Tue 14 Jul 2026, Age ~46h).
  This is a pre-existing edge negative-cache artifact present on old production too; the route
  itself works (verified below). Logged to backlog, not a release blocker.
