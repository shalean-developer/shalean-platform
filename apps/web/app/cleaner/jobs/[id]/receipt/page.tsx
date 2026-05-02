import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export default async function CleanerJobReceiptPlaceholderPage({ params }: Props) {
  const { id } = await params;
  const bid = typeof id === "string" ? id.trim() : "";
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-lg font-semibold">Receipt</h1>
      <p className="text-sm text-muted-foreground">
        A printable receipt view for this job is not available in the app yet. Use job details for line items and
        timing; contact support if you need a formal statement.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="default">
          <Link href={bid ? `/cleaner/jobs/${encodeURIComponent(bid)}` : "/cleaner/jobs"}>Open job</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cleaner/earnings">Back to earnings</Link>
        </Button>
      </div>
    </div>
  );
}
