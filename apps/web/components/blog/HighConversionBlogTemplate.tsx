import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkInParagraphClassName } from "@/lib/ui/linkClassNames";

const proseArticle =
  "prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline";

const standardPath = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
const deepPath = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const moveOutPath = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
const officePath = CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path;

function BlogHighConversionCtaBlock({
  source,
  heading = "Need help with cleaning?",
  subtext = "Book a professional cleaner in Cape Town today.",
}: {
  source: string;
  heading?: string;
  subtext?: string;
}) {
  return (
    <div className="not-prose mt-8 rounded-xl bg-blue-50 p-6">
      <h3 className="text-lg font-semibold text-zinc-900">{heading}</h3>
      <p className="mt-2 text-zinc-600">{subtext}</p>
      <GrowthCtaLink
        href="/booking/details"
        source={source}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Book a cleaner
      </GrowthCtaLink>
    </div>
  );
}

function MandatoryInternalLinks({ article }: { article: HighConversionBlogArticle }) {
  const extra = article.mandatoryAdditionalService;
  const labels = article.mandatoryServiceLinkLabels;
  const standardLabel = labels?.standard ?? "standard home cleaning in Cape Town";
  const deepLabel = labels?.deep ?? "deep cleaning services in Cape Town";
  return (
    <div className={proseArticle}>
      <p>
        When you are ready to move from reading to booking, start with our Cape Town service guides:{" "}
        <Link href={standardPath} className={linkInParagraphClassName}>
          {standardLabel}
        </Link>
        ,{" "}
        <Link href={deepPath} className={linkInParagraphClassName}>
          {deepLabel}
        </Link>
        {extra ? (
          <>
            ,{" "}
            <Link href={extra.href} className={linkInParagraphClassName}>
              {extra.label}
            </Link>
          </>
        ) : null}
        , and suburb context for{" "}
        <Link href={article.primaryLocation.href} className={linkInParagraphClassName}>
          {article.primaryLocation.label}
        </Link>
        —each opens a page you can follow to checkout with a clear total.
      </p>
    </div>
  );
}

function RelatedServicesSection() {
  return (
    <section className="not-prose mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6" aria-labelledby="hc-related-services">
      <h2 id="hc-related-services" className="text-lg font-bold tracking-tight text-zinc-900">
        Related services
      </h2>
      <ul className="mt-4 space-y-2 text-base">
        <li>
          <Link href={standardPath} className="font-medium text-blue-700 hover:text-blue-800 hover:underline">
            Home cleaning (standard) — Cape Town
          </Link>
        </li>
        <li>
          <Link href={deepPath} className="font-medium text-blue-700 hover:text-blue-800 hover:underline">
            Deep cleaning — Cape Town
          </Link>
        </li>
        <li>
          <Link href={moveOutPath} className="font-medium text-blue-700 hover:text-blue-800 hover:underline">
            Move-out cleaning — Cape Town
          </Link>
        </li>
        <li>
          <Link href={officePath} className="font-medium text-blue-700 hover:text-blue-800 hover:underline">
            Office cleaning — Cape Town
          </Link>
        </li>
      </ul>
    </section>
  );
}

function renderSection(section: HighConversionBlogArticle["sections"][number]) {
  return (
    <div key={section.id} className={proseArticle}>
      {section.level === "h2" ? <h2>{section.heading}</h2> : <h3>{section.heading}</h3>}
      {section.paragraphs.map((p, i) => (
        <p key={`${section.id}-p-${i}`}>{p}</p>
      ))}
      {section.bullets?.length ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-zinc-400">
          {section.bullets.map((item, i) => (
            <li key={`${section.id}-li-${i}`}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Props = { article: HighConversionBlogArticle };

export function HighConversionBlogTemplate({ article }: Props) {
  const mid = Math.max(1, Math.ceil(article.sections.length / 2));
  const firstSections = article.sections.slice(0, mid);
  const restSections = article.sections.slice(mid);

  return (
    <>
      <div className="not-prose mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
          {article.h1}
        </h1>
      </div>

      <div className={proseArticle}>
        <p className="lead text-lg text-zinc-700">{article.introParagraphs[0]}</p>
        {article.introParagraphs.slice(1).map((p, i) => (
          <p key={`intro-${i}`}>{p}</p>
        ))}
      </div>

      <MandatoryInternalLinks article={article} />

      {firstSections.map((s) => renderSection(s))}

      <BlogHighConversionCtaBlock
        source={`blog_hc_${article.slug}_mid`}
        heading={article.cta?.heading}
        subtext={article.cta?.subtext}
      />

      {restSections.map((s) => renderSection(s))}

      <RelatedServicesSection />

      <BlogHighConversionCtaBlock
        source={`blog_hc_${article.slug}_end`}
        heading={article.cta?.heading}
        subtext={article.cta?.subtext}
      />

      <section className="not-prose mt-12" aria-labelledby="hc-faq-heading">
        <h2 id="hc-faq-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Frequently asked questions
        </h2>
        <dl className="mt-6 space-y-6">
          {article.faqs.map((item) => (
            <div key={item.question} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <dt className="text-base font-semibold text-zinc-900">{item.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-zinc-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {article.conclusionParagraphs?.length ? (
        <section className={`${proseArticle} mt-12`} aria-labelledby="hc-conclusion-heading">
          <h2 id="hc-conclusion-heading">Conclusion</h2>
          {article.conclusionParagraphs.map((p, i) => (
            <p key={`conclusion-${i}`}>{p}</p>
          ))}
        </section>
      ) : null}
    </>
  );
}
