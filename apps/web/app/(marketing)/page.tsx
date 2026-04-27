import { getHomePageData } from "@/lib/home/data";
import StructuredData from "@/components/home/StructuredData";
import MarketingHomePageClient from "./MarketingHomePageClient";

export default async function Page() {
  const { services, locations, faqs } = await getHomePageData();
  return (
    <>
      <StructuredData services={services} locations={locations} faqs={faqs} />
      <MarketingHomePageClient />
    </>
  );
}
