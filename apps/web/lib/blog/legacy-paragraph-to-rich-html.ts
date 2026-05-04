/**
 * Migrate legacy `paragraph` blocks (plain text + `[label](/path)` links) to TipTap HTML.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineWithMarkdownLinksToHtml(line: string): string {
  const parts: string[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      parts.push(escapeHtml(line.slice(last, m.index)));
    }
    parts.push(`<a href="${escapeHtml(m[2])}">${escapeHtml(m[1])}</a>`);
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    parts.push(escapeHtml(line.slice(last)));
  }
  return parts.length ? parts.join("") : escapeHtml(line);
}

export function legacyParagraphToRichHtml(content: string): string {
  const t = content.trim();
  if (!t) return "<p></p>";
  return content
    .split(/\n\n+/)
    .map((para) => {
      const inner = para.split("\n").map(lineWithMarkdownLinksToHtml).join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}
