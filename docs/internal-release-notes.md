# Internal release notes

Short operational log for non-PR context (ops, support, QA).

- **2026-05-03** — Cleaner job lifecycle (accept / on my way / start / complete): fixed `isOfflineSignal(null, …)` always treating the client as offline, which queued every action locally and skipped flush POSTs; server and dashboard now receive lifecycle updates when online.
