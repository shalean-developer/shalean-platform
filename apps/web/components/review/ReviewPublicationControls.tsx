"use client";
import { useState } from "react";
import { adminFetch } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import { reviewServicePresentation, type ReviewDetailChoices, type ReviewPublicationContext } from "@/lib/reviews/publicReviewDetails";

type Review = {
  id: string; comment: string | null; homepage_approved: boolean; public_display_consent: boolean;
  public_name_consent: boolean; public_area_consent: boolean; public_service_consent: boolean;
  publication_context: ReviewPublicationContext; published_details: ReviewDetailChoices;
};
export function ReviewPublicationControls({ review, onSaved }: { review: Review; onSaved: () => Promise<void> }) {
  const expectedPreferences = { name: review.public_name_consent, area: review.public_area_consent, service: review.public_service_consent };
  const [details, setDetails] = useState<ReviewDetailChoices>(review.homepage_approved ? review.published_details : expectedPreferences);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const context = review.publication_context;
  const options = [
    { key: "name", label: "First name and surname initial", value: context.display_name },
    { key: "area", label: "Booking suburb", value: context.suburb_label },
    { key: "service", label: "Booked service", value: reviewServicePresentation(context.service_key)?.title },
  ] as const;
  async function save(approved: boolean) {
    if (approved && !confirmed) return;
    setBusy(true);
    try {
      const result = await adminFetch(`/api/admin/reviews/${review.id}/homepage`, {
        method: "POST", body: JSON.stringify({ approved, expectedComment: review.comment, expectedConsent: review.public_display_consent,
          expectedPreferences, expectedContext: context, details, permissionConfirmed: confirmed }),
      });
      if (!result.ok) { showToast(result.error ?? "Could not update website publication", "error"); return; }
      showToast(approved ? "Website review approval saved" : "Removed from website", "success");
      await onSaved();
    } catch { showToast("Could not save website approval. Please try again.", "error"); }
    finally { setBusy(false); }
  }
  return <fieldset className="max-w-xs space-y-3 rounded-xl border border-slate-200 p-3 text-xs text-slate-600" disabled={busy}>
    <legend className="px-1 font-semibold">Website publication</legend>
    <p>Extra details are optional. Select only details the customer has permitted you to publish.</p>
    {options.map(({ key, label, value }) => <label key={key} className="flex items-start gap-2">
      <input type="checkbox" checked={details[key]} disabled={!value && !details[key]} onChange={(event) => { setDetails({ ...details, [key]: event.target.checked }); setConfirmed(false); }} />
      <span>{label}: <strong>{value || "Unavailable"}</strong></span>
    </label>)}
    <div className="rounded-lg bg-sky-50 p-3" aria-label="Public review preview">
      <p className="font-semibold">{details.name && context.display_name ? context.display_name : "Verified customer"}</p>
      <p>{[details.area ? context.suburb_label : null, details.service ? reviewServicePresentation(context.service_key)?.title : null].filter(Boolean).join(" · ")}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{review.comment}</p>
    </div>
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I confirm the customer permitted this written review and every selected detail for public website display. I checked the preview and comment for private details.</span>
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !confirmed} onClick={() => void save(true)} className="rounded-lg border border-blue-200 px-3 py-2 font-semibold text-blue-700 disabled:opacity-50">{busy ? "Saving…" : review.homepage_approved ? "Update website approval" : "Approve for website"}</button>
      {review.homepage_approved ? <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-lg border border-slate-200 px-3 py-2">Remove from website</button> : null}
    </div>
  </fieldset>;
}
