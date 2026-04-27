import { describe, expect, it } from "vitest";
import { paymentConversionBucketFromSeconds } from "@/lib/booking/paymentConversionBucket";

describe("paymentConversionBucketFromSeconds", () => {
  it("returns null for invalid input", () => {
    expect(paymentConversionBucketFromSeconds(null)).toBeNull();
    expect(paymentConversionBucketFromSeconds(undefined)).toBeNull();
    expect(paymentConversionBucketFromSeconds(NaN)).toBeNull();
    expect(paymentConversionBucketFromSeconds(-1)).toBeNull();
  });

  it("buckets by thresholds", () => {
    expect(paymentConversionBucketFromSeconds(0)).toBe("instant");
    expect(paymentConversionBucketFromSeconds(299)).toBe("instant");
    expect(paymentConversionBucketFromSeconds(300)).toBe("fast");
    expect(paymentConversionBucketFromSeconds(1799)).toBe("fast");
    expect(paymentConversionBucketFromSeconds(1800)).toBe("medium");
    expect(paymentConversionBucketFromSeconds(7199)).toBe("medium");
    expect(paymentConversionBucketFromSeconds(7200)).toBe("slow");
    expect(paymentConversionBucketFromSeconds(86_400)).toBe("slow");
  });
});
