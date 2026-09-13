import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HelpCardProps = {
  compact?: boolean;
};

export function HelpCard({ compact }: HelpCardProps) {
  return (
    <Card className="relative overflow-hidden border-success/20 bg-success/5">
      <CardContent className={cn(compact ? "p-4" : "p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("font-semibold text-foreground", compact && "text-sm")}>We&apos;re here to help</p>
            <p className={cn("mt-1 text-muted-foreground", compact ? "text-xs leading-snug" : "text-sm")}>
              Chat with our support team on WhatsApp.
            </p>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-success/10 text-success",
              compact ? "h-8 w-8" : "h-10 w-10",
            )}
          >
            <MessageCircle className={cn(compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={1.75} aria-hidden />
          </div>
        </div>
        <Button
          asChild
          className={cn(
            "w-full bg-success text-success-foreground hover:brightness-95",
            compact ? "mt-3 h-9 px-3 text-xs" : "mt-4",
          )}
        >
          <a href="https://wa.me/27825915525" target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Chat now · 082 591 5525
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
