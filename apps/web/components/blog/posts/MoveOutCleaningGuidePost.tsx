import Link from "next/link";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;

export function MoveOutCleaningGuidePost() {
  return (
    <div className="prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
      <p className="lead text-lg text-zinc-700">
        Western Cape rental inspections focus on kitchens, bathrooms, and floors first. This guide helps Cape Town tenants and landlords align move-out cleaning with
        realistic handover timing—without last-minute panic.
      </p>

      <h2>Two weeks before keys</h2>
      <ul>
        <li>Confirm inventory requirements with your agent—note oven, fridge, and inside-cupboard expectations.</li>
        <li>Book movers and cleaning on separate days where possible so floors stay clean after furniture exits.</li>
        <li>If grease or limescale has built up, compare{" "}
          <Link href={deep}>deep cleaning in Cape Town</Link> add-ons alongside your{" "}
          <Link href={moveOut}>move-out cleaning</Link> scope.</li>
      </ul>

      <h2>48 hours before handover</h2>
      <ul>
        <li>Remove rubbish and personal items so cleaners can reach skirting, corners, and built-ins.</li>
        <li>Defrost the fridge if interior cleaning is included in your booking tier.</li>
        <li>Leave parking and access notes—Cape Town complexes often need codes for loading bays.</li>
      </ul>

      <h2>What teams prioritise on inspection day</h2>
      <p>
        Expect detailed attention to hobs, sinks, showers, taps, and floor edges—areas that show wear in photos. Cupboard exteriors, doors, and high-touch points are
        standard on most handover scopes; interiors are usually extras unless your lease says otherwise.
      </p>

      <h2>After the clean</h2>
      <ul>
        <li>Walk the unit with your checklist while lighting is good.</li>
        <li>Photograph any last touch-ups needed and share them quickly with your cleaner or coordinator.</li>
        <li>Keep your invoice for deposit conversations—especially across Cape Town rental agencies with strict timelines.</li>
      </ul>

      <p>
        Still deciding between a lighter reset and full handover detail? Compare scopes on our{" "}
        <Link href={moveOut}>move-out cleaning Cape Town</Link> page, read{" "}
        <Link href="/blog/cleaning-cost-cape-town">how cleaning pricing works in Cape Town</Link>, or see{" "}
        <Link href="/blog/deep-vs-standard-cleaning-cape-town">deep vs standard cleaning</Link> if you are unsure which
        tier fits before keys go back.
      </p>
      <p>
        Mid-lease, many rentals stay calmer with{" "}
        <Link href={standard}>standard cleaning services in Cape Town</Link> on a rhythm so move-out day is less overwhelming.
      </p>
    </div>
  );
}
