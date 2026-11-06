function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Self-contained, script-free email-link page; no external tracking resources. */
export function unsubscribePage(title: string, description: string, token?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)} | Shalean</title><style>body{margin:0;background:#f4f7fb;color:#172033;font:16px/1.6 system-ui,sans-serif}main{max-width:520px;margin:8vh auto;padding:32px;background:white;border:1px solid #dbe2eb;border-radius:20px}h1{font-size:26px;line-height:1.3}a{color:#134bcc}button{border:0;border-radius:10px;background:#155eef;color:white;padding:14px 22px;font:inherit;font-weight:600;cursor:pointer}.brand{font-weight:750;color:#1646ba}.note{font-size:14px;color:#475467}@media(max-width:600px){main{margin:24px 16px;padding:24px}}</style></head><body><main><p class="brand">Shalean Cleaning Services</p><h1>${escape(title)}</h1><p>${escape(description)}</p>${token ? `<form method="post"><input type="hidden" name="token" value="${escape(token)}"><button type="submit">Unsubscribe</button></form>` : ''}<p class="note">Booking confirmations, payment receipts and security notices continue separately.</p><p><a href="/account/profile" rel="noreferrer">Manage email preferences</a></p></main></body></html>`;
}
