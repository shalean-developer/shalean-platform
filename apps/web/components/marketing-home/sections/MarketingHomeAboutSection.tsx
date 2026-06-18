import { Star, Quote } from "lucide-react";

export function MarketingHomeAboutSection() {
  return (
    <section id="about" className="scroll-mt-24 bg-white py-14 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">

          {/* Card 1: Since 2022 */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Established</p>
            <div className="mt-4">
              <p className="text-3xl font-extrabold tracking-tight text-slate-900">Since</p>
              <p className="text-3xl font-extrabold tracking-tight text-slate-900">2022</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Proudly cleaning homes across Cape Town.
            </p>
          </div>

          {/* Card 2: Homes cleaned */}
          <div className="flex flex-col justify-between rounded-2xl bg-[#1e4fd4] p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Total cleans</p>
            <div className="mt-4">
              <p className="text-4xl font-extrabold tracking-tight text-white">4,500+</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-blue-200">
              Homes cleaned with care.
            </p>
          </div>

          {/* Card 3: Testimonial */}
          <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:col-span-1">
            <Quote className="h-8 w-8 text-slate-200" strokeWidth={1} aria-hidden />
            <blockquote className="mt-3 text-sm leading-relaxed text-slate-700">
              Shalean Cleaning transformed my home! The team was so friendly and left every corner spotless. Highly recommended.
            </blockquote>
            <footer className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                NP
              </div>
              <div>
                <cite className="not-italic">
                  <span className="block text-sm font-bold text-slate-900">Nomsa P.</span>
                  <span className="text-xs text-slate-400">Claremont</span>
                </cite>
              </div>
            </footer>
          </div>

          {/* Card 4: 5-star reviews */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              ))}
            </div>
            <div className="mt-4">
              <p className="text-3xl font-extrabold tracking-tight text-slate-900">100+</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              5-star reviews from happy customers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
