# Booking payment data dictionary (Phase A)

| Column / object | Owner | Meaning after Phase A |
|-----------------|-------|------------------------|
| `bookings.payment_status` | Payments | Authoritative settlement state |
| `bookings.amount_paid_cents` | Payments | Collected cash (cents SoT) |
| `bookings.total_paid_cents` | Payments | Legacy mirror of collected cash |
| `bookings.total_paid_zar` | Payments | Legacy ZAR mirror of collected cash |
| `bookings.total_price` | Booking quote | Payable / expected charge (ZAR) |
| `bookings.price_snapshot.pay_total_zar` | Booking quote | Payable snapshot for Paystack match |
| `payment_transactions` | Payments | Gateway / R0 ledger |
| `payment_transactions.payment_channel = promo_credit_cover` | Payments | R0 fully covered settlement |
| `bookings.payment_transaction_id` | Payments | Link to ledger (required for R0 zero-cash success) |

See ADR: `docs/adr/2026-07-13-booking-payment-settlement-cash-columns.md`.
