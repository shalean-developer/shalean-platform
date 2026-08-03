# Staging sync — 2026-08-03

Purpose: synchronize the long-lived `staging` branch with the current `main` branch before validating Admin RBAC Phase 2.

This PR intentionally contains the accumulated production changes that are present on `main` but absent from `staging`. It must be reviewed and pass CI before merge because the two branches have diverged.
