import type { ContentGapTopic } from "@/lib/seo/find-content-gaps";
import { generateKeywordVariations } from "@/lib/seo/keyword-expansion";

export type QueuePriority = "critical" | "high" | "medium" | "low";

export type QueuedSeoTopic = ContentGapTopic & {
  id: string;
  priority: QueuePriority;
  score: number;
  /** ISO-8601 when enqueued */
  queuedAt: string;
  /** Keyword phrases contributing to score (expansion + intent) */
  signals: string[];
};

const BOOKING_INTENT = /\b(book|booking|schedule|reserve|quote|price|cost|rate|near me|today|this week|same day)\b/i;

function randomId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Higher = stronger commercial / local demand heuristic (no external API). */
export function scoreTopicForSeo(topic: ContentGapTopic, extraPhrases: string[] = []): number {
  const phrases = [topic.keywordPhrase, ...extraPhrases];
  const variations = phrases.flatMap((p) => generateKeywordVariations(p));
  const allText = [...phrases, ...variations].join(" ").toLowerCase();

  const intentHits = [...allText.matchAll(BOOKING_INTENT)].length;
  const intent = Math.min(60, intentHits * 14);

  const locDemand = topic.citySlug === "cape-town" ? 22 : 18;
  const serviceDemand = /deep|move|airbnb|office/i.test(topic.serviceSlug) ? 20 : 14;

  const breadth = Math.min(25, Math.floor(variations.length / 5));

  return Math.round(intent + locDemand + serviceDemand + breadth);
}

export function priorityFromScore(score: number): QueuePriority {
  if (score >= 95) return "critical";
  if (score >= 78) return "high";
  if (score >= 58) return "medium";
  return "low";
}

export function enqueueTopics(topics: ContentGapTopic[], variationHints: Map<string, string[]> = new Map()): QueuedSeoTopic[] {
  const now = new Date().toISOString();
  return topics.map((t) => {
    const hints = variationHints.get(t.suggestedSlug) ?? [t.keywordPhrase];
    const score = scoreTopicForSeo(t, hints);
    return {
      ...t,
      id: randomId(),
      priority: priorityFromScore(score),
      score,
      queuedAt: now,
      signals: hints.slice(0, 12),
    };
  });
}

export function sortQueuedTopicsDesc(items: QueuedSeoTopic[]): QueuedSeoTopic[] {
  return [...items].sort((a, b) => b.score - a.score || a.suggestedSlug.localeCompare(b.suggestedSlug));
}

export function takeTopTopics(items: QueuedSeoTopic[], limit: number): QueuedSeoTopic[] {
  return sortQueuedTopicsDesc(items).slice(0, Math.max(0, limit));
}

export class SeoContentQueue {
  private items: QueuedSeoTopic[] = [];

  reset(items: QueuedSeoTopic[]): void {
    this.items = sortQueuedTopicsDesc([...items]);
  }

  pushMany(topics: ContentGapTopic[], variationHints?: Map<string, string[]>): void {
    const next = enqueueTopics(topics, variationHints ?? new Map());
    this.items = sortQueuedTopicsDesc([...this.items, ...next]);
  }

  all(): QueuedSeoTopic[] {
    return [...this.items];
  }

  peek(limit: number): QueuedSeoTopic[] {
    return takeTopTopics(this.items, limit);
  }

  drain(limit: number): QueuedSeoTopic[] {
    const top = takeTopTopics(this.items, limit);
    const keep = new Set(top.map((t) => t.id));
    this.items = this.items.filter((t) => !keep.has(t.id));
    return top;
  }
}
