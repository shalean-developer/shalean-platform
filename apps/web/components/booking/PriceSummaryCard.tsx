"use client";

import { memo } from "react";
import { BookingSummary, type BookingSummaryProps } from "@/components/booking/summary/BookingSummary";

export type PriceSummaryCardProps = BookingSummaryProps;

export const PriceSummaryCard = memo(function PriceSummaryCard(props: PriceSummaryCardProps) {
  return <BookingSummary {...props} />;
});
