export function LocationContentSections({ locationName }: { locationName: string }) {
  const faq = [
    {
      q: `How quickly can I book in ${locationName}?`,
      a: "Most customers complete booking in under 60 seconds.",
    },
    {
      q: "Are cleaners vetted?",
      a: "Yes. Cleaners are verified and rated by real customers.",
    },
    {
      q: "How do I pay?",
      a: "Secure online payment with instant confirmation.",
    },
  ];

  return (
    <>
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <div className="mt-2 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300 md:grid-cols-3">
          <p className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">“Super quick booking and great cleaner.” — Amahle</p>
          <p className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">“Exactly on time and spotless result.” — Jason</p>
          <p className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">“Best cleaning experience so far.” — Lerato</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">FAQ</h2>
        <div className="mt-2 space-y-3">
          {faq.map((item) => (
            <div key={item.q}>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.q}</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
