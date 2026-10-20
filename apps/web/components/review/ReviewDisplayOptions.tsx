"use client";
export type ReviewDisplayChoices = { publicDisplayConsent: boolean; publicNameConsent: boolean; publicAreaConsent: boolean; publicServiceConsent: boolean };
const OPTIONS = [
  { key: "publicNameConsent", label: "Include my first name and surname initial" },
  { key: "publicAreaConsent", label: "Include my booking suburb (no street address)" },
  { key: "publicServiceConsent", label: "Include my booked cleaning service" },
] as const;
export function ReviewDisplayOptions({ value, onChange, disabled }: { value: ReviewDisplayChoices; onChange: (value: ReviewDisplayChoices) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="space-y-3 text-sm text-zinc-600">
    <legend className="mb-2 font-medium">Website display (optional)</legend>
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={value.publicDisplayConsent} onChange={(event) => onChange(event.target.checked ? { ...value, publicDisplayConsent: true } : { publicDisplayConsent: false, publicNameConsent: false, publicAreaConsent: false, publicServiceConsent: false })} className="mt-1 h-4 w-4" />
      <span>Shalean may display my written review on its website. It will appear as “Verified customer” unless I choose to include my name below.</span>
    </label>
    <div className="space-y-3 pl-7">
      {OPTIONS.map(({ key, label }) => <label key={key} className="flex items-start gap-3">
        <input type="checkbox" checked={value[key]} disabled={!value.publicDisplayConsent} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} className="mt-1 h-4 w-4" />
        <span>{label}</span>
      </label>)}
    </div>
    <p className="text-xs">You can withdraw any choice in your account at any time. Your star rating still contributes to overall ratings. Please leave contact details and addresses out of your comment.</p>
  </fieldset>;
}
