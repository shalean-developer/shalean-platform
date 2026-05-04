import Link from "next/link";
import { Fragment } from "react";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

type Segment = { kind: "text"; value: string } | { kind: "link"; label: string; href: string };

function parseSegments(text: string): Segment[] {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "link", label: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.length ? out : [{ kind: "text", value: text }];
}

function InlineAnchor({ href, label }: { href: string; label: string }) {
  const cls = cn(linkEmphasisClassName, "font-semibold underline-offset-2 hover:underline");
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a
        href={href}
        className={cls}
        {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

/** Renders `[label](url)` as Next `Link` or `<a>` for mailto / external. */
export function FaqRichText({ text, className }: { text: string; className?: string }) {
  const segments = parseSegments(text);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <Fragment key={i}>{seg.value}</Fragment>
        ) : (
          <InlineAnchor key={i} href={seg.href} label={seg.label} />
        ),
      )}
    </span>
  );
}
