/**
 * Minimal Slack incoming-webhook helper for operational alerts (analytics anomalies, etc.).
 */
export async function postSlackIncomingWebhook(webhookUrl: string, text: string): Promise<Response> {
  return fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 3500) }),
  });
}
