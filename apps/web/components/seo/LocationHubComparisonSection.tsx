import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

type Row = { label: string; shalean: string; independent: string };

const ROWS: Row[] = [
  {
    label: "Price consistency",
    shalean: "Locked quote online before payment — scope items visible at checkout.",
    independent: "Quotes vary call-to-call; extras often negotiated on the day.",
  },
  {
    label: "Reliability",
    shalean: "Vetted, insured teams with routing support if access or timing shifts.",
    independent: "Depends on individual availability; backups may be limited.",
  },
  {
    label: "Supplies included",
    shalean: "Standard kits aligned to booked tier — note special finishes in advance.",
    independent: "Sometimes BYO products; quality and suitability vary.",
  },
  {
    label: "Booking ease",
    shalean: "Self-serve slots + human support for codes, parking, pets.",
    independent: "Often WhatsApp-heavy; scheduling can lag at peak times.",
  },
];

type Props = { location: CapeTownLocationRow };

export function LocationHubComparisonSection({ location }: Props) {
  return (
    <section className="border-b border-zinc-100 py-16" aria-labelledby="hub-vs-independent-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-vs-independent-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Why choose Shalean vs independent cleaners in {location.name}?
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
          Independent operators can work well — this table captures what {location.name} households tell us matters once
          turnovers, parking, and inventory photos enter the picture.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                  Factor
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-emerald-900">
                  Shalean
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-zinc-700">
                  Typical solo / informal cleaner
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-zinc-100 last:border-b-0">
                  <th scope="row" className="px-4 py-3 font-medium text-zinc-900">
                    {row.label}
                  </th>
                  <td className="px-4 py-3 leading-relaxed text-zinc-700">{row.shalean}</td>
                  <td className="px-4 py-3 leading-relaxed text-zinc-600">{row.independent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
