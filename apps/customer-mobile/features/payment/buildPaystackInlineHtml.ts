import type { PaystackInlineParams } from "@/features/payment/types";

function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

/**
 * HTML document that loads Paystack Inline (classic `js.paystack.co/v1/inline.js`)
 * and posts success/cancel messages to the React Native WebView.
 */
export function buildPaystackInlineHtml(params: PaystackInlineParams): string {
  const key = escapeJsString(params.publicKey.trim());
  const email = escapeJsString(params.email.trim());
  const reference = escapeJsString(params.reference.trim());
  const bookingId = escapeJsString(params.bookingId.trim());
  const amountZar = Math.max(0, Math.round(Number(params.amountZar) || 0));
  const amountKobo = amountZar * 100;
  const payTotal = String(amountZar);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Pay with Paystack</title>
  <style>
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; box-sizing: border-box; }
    .hint { font-size: 14px; color: #64748b; margin-top: 8px; }
    .err { color: #b91c1c; font-size: 14px; margin-top: 12px; }
  </style>
  <script src="https://js.paystack.co/v1/inline.js"></script>
</head>
<body>
  <div class="wrap">
    <div id="status">Opening secure payment…</div>
    <div class="hint">Do not close this screen until Paystack finishes.</div>
    <div id="err" class="err" hidden></div>
  </div>
  <script>
    (function () {
      function post(payload) {
        try {
          var msg = JSON.stringify(payload);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(msg);
          } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(msg, '*');
          }
        } catch (e) {}
      }

      function showError(message) {
        var el = document.getElementById('err');
        var st = document.getElementById('status');
        if (st) st.textContent = 'Could not open payment';
        if (el) { el.hidden = false; el.textContent = message; }
        post({ type: 'error', message: message });
      }

      try {
        if (typeof PaystackPop === 'undefined' || !PaystackPop.setup) {
          showError('Paystack failed to load. Check your connection and retry.');
          return;
        }
        var handler = PaystackPop.setup({
          key: '${key}',
          email: '${email}',
          amount: ${amountKobo},
          currency: 'ZAR',
          ref: '${reference}',
          metadata: {
            booking_id: '${bookingId}',
            pay_total_zar: '${payTotal}',
            expected_total_zar: '${payTotal}',
            custom_fields: [
              { display_name: 'Booking ID', variable_name: 'booking_id', value: '${bookingId}' }
            ]
          },
          callback: function (response) {
            var ref = (response && response.reference) ? String(response.reference) : '${reference}';
            document.getElementById('status').textContent = 'Payment received — confirming…';
            post({ type: 'success', reference: ref });
          },
          onClose: function () {
            post({ type: 'cancel' });
          }
        });
        handler.openIframe();
      } catch (e) {
        showError(e && e.message ? String(e.message) : 'Could not start Paystack.');
      }
    })();
  </script>
</body>
</html>`;
}
