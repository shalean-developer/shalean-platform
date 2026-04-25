/** Console noise control: always in dev; in production log ~`sampleRate` of events. */
export function devOrSampledConsoleLog(tag: string, payload: Record<string, unknown>, sampleRate = 0.02): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(tag, payload);
    return;
  }
  if (Math.random() < sampleRate) {
    console.log(tag, { ...payload, _sampled: true });
  }
}
