import Image from "next/image";

const SRC = "/images/marketing/cleaning-team-bright-space-cape-town.webp";
const ALT = "Shalean cleaning team finishing a bright living space in Cape Town";

/** Visual break after service links—supports “image after services” layout guidance. */
export function BlogPostServicesBelowFigure() {
  return (
    <figure className="not-prose mt-10 w-full space-y-2">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 shadow-sm">
        <Image src={SRC} alt={ALT} fill className="object-cover" sizes="(max-width: 896px) 100vw, 896px" />
      </div>
      <figcaption className="text-center text-xs text-zinc-500">Vetted teams across Cape Town suburbs</figcaption>
    </figure>
  );
}
