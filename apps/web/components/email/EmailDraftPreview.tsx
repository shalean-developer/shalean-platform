import styles from "./email-ui.module.css";

/** Untrusted draft markup stays in an opaque, script-free frame with no network access. */
export function EmailDraftPreview({ html, text }: { html: string | null; text: string }) {
  const preview = html ? `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;color:#00164e;overflow-wrap:anywhere}img{max-width:100%;height:auto}a,button,input,select,textarea{pointer-events:none!important}</style></head><body>${html}</body></html>` : null;
  return <section className="mt-4" aria-label="Email draft preview">
    {preview ? <iframe title="Email draft preview" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} className={styles.preview} /> : <p className="whitespace-pre-wrap text-sm">{text}</p>}
    <p className="mt-2 text-xs text-slate-500">Preview only. Remote images are blocked. Copying a draft does not send it.</p>
    <details className="mt-3 rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">View code</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{html || text}</pre>
    </details>
  </section>;
}
