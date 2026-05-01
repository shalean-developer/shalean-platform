"use client";

type CustomerDetailsStepProps = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  onChange: (patch: { customerName?: string; customerEmail?: string; customerPhone?: string }) => void;
};

export function CustomerDetailsStep({ customerName, customerEmail, customerPhone, onChange }: CustomerDetailsStepProps) {
  const field =
    "min-h-[56px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-base text-zinc-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cust-name" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Full name <span className="text-red-600">*</span>
        </label>
        <input
          id="cust-name"
          type="text"
          autoComplete="name"
          value={customerName}
          onChange={(e) => onChange({ customerName: e.target.value })}
          className={field}
          placeholder="Jane Doe"
        />
      </div>
      <div>
        <label htmlFor="cust-email" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email <span className="text-red-600">*</span>
        </label>
        <input
          id="cust-email"
          type="email"
          autoComplete="email"
          value={customerEmail}
          onChange={(e) => onChange({ customerEmail: e.target.value })}
          className={field}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="cust-phone" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone <span className="text-red-600">*</span>
        </label>
        <input
          id="cust-phone"
          type="tel"
          autoComplete="tel"
          value={customerPhone}
          onChange={(e) => onChange({ customerPhone: e.target.value })}
          className={field}
          placeholder="+27 …"
        />
      </div>
    </div>
  );
}
