import { Home, Droplets, Truck, Building2, CalendarCheck, Shirt } from "lucide-react";

const SERVICES = [
  { Icon: Home, label: "Home Cleaning", price: "R350" },
  { Icon: Droplets, label: "Deep Cleaning", price: "R550" },
  { Icon: Truck, label: "Move-in / Move-out", price: "R650" },
  { Icon: Building2, label: "Office Cleaning", price: "R450" },
  { Icon: CalendarCheck, label: "Airbnb Cleaning", price: "R450" },
  { Icon: Shirt, label: "Laundry & Ironing", price: "R250" },
] as const;

export function MarketingHomeCoreServicesSection() {
  return (
    <section aria-label="Service pricing overview" className="border-y border-slate-100 bg-white py-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Horizontal scroll on mobile, wrap on larger screens */}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:justify-center">
          {SERVICES.map(({ Icon, label, price }) => (
            <div
              key={label}
              className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm sm:shrink"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">
                  From <span className="font-bold text-blue-600">{price}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
