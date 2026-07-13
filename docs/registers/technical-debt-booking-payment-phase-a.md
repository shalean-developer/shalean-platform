# Technical Debt Register — booking payment Phase A

| Debt ID | Item | Status |
|---------|------|--------|
| DEBT-BOOK-001 | Dual pricing engines (v2 vs legacy) | Open (out of Phase A) |
| DEBT-BOOK-002 | Cash helper misuse on unpaid confirm | **Addressed** (BK-001) |
| DEBT-BOOK-005 | Precheck vs mismatch epsilon | Open (BK-010) |
| DEBT-BOOK-011 | Quote persist previously wrote cash columns | **Addressed** with confirm (no longer writes cash) |
| DEBT-BOOK-012 | App-level R0 fallback until migration applied | Temporary — remove after `20261076` is live everywhere |
