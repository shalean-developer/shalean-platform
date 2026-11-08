import type { ReactNode } from 'react';

export function CashFlowDetails({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group rounded-xl border border-slate-200 bg-white text-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
      {title}<span aria-hidden="true" className="text-lg text-blue-600 transition-transform group-open:rotate-45">+</span>
    </summary>
    <div className="space-y-3 border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-600">{children}</div>
  </details>;
}
