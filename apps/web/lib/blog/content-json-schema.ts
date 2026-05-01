import { z } from "zod";

import {
  BLOG_CONTENT_JSON_SCHEMA_VERSION,
  type BlogContentJson,
} from "./content-json";

const baseBlock = z
  .object({
    id: z.string().optional(),
  })
  .strict();

const introBlock = baseBlock.extend({
  type: z.literal("intro"),
  content: z.string(),
}).strict();

const quickAnswerBlock = baseBlock.extend({
  type: z.literal("quick_answer"),
  content: z.string(),
}).strict();

const sectionBlock = baseBlock.extend({
  type: z.literal("section"),
  title: z.string(),
  content: z.string(),
  heading_level: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
}).strict();

const comparisonBlock = baseBlock.extend({
  type: z.literal("comparison"),
  items: z
    .array(
      z
        .object({
          label: z.string(),
          value: z.string(),
        })
        .strict()
    )
    .min(1),
}).strict();

const bulletsBlock = baseBlock.extend({
  type: z.literal("bullets"),
  items: z.array(z.string()).min(1),
  title: z.string().optional(),
}).strict();

const faqItem = z
  .object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })
  .strict();

const faqBlock = baseBlock.extend({
  type: z.literal("faq"),
  items: z.array(faqItem).min(1),
}).strict();

const ctaBlock = z
  .object({
    id: z.string().optional(),
    type: z.literal("cta"),
    title: z.string(),
    description: z.string().optional(),
    button_text: z.string(),
    link: z.string(),
    variant: z.enum(["primary", "secondary", "outline"]).optional(),
  })
  .strict()
  .transform((b) => ({
    ...b,
    variant: b.variant === "outline" ? ("secondary" as const) : b.variant,
  }));

const paragraphBlock = baseBlock.extend({
  type: z.literal("paragraph"),
  content: z.string(),
}).strict();

const keyTakeawaysBlock = baseBlock.extend({
  type: z.literal("key_takeaways"),
  items: z.array(z.string()).min(1),
}).strict();

const imageBlock = baseBlock.extend({
  type: z.literal("image"),
  url: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
}).strict();

const quoteBlock = baseBlock.extend({
  type: z.literal("quote"),
  content: z.string(),
  attribution: z.string().optional(),
}).strict();

const internalLinksBlock = baseBlock.extend({
  type: z.literal("internal_links"),
  title: z.string().optional(),
  links: z
    .array(
      z
        .object({
          label: z.string(),
          url: z.string(),
        })
        .strict()
    )
    .min(1),
}).strict();

const comparisonTableBlock = baseBlock
  .extend({
    type: z.literal("comparison_table"),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  })
  .strict()
  .superRefine((val, ctx) => {
    const n = val.columns.length;
    val.rows.forEach((row, i) => {
      if (row.length !== n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `comparison_table row ${i} has ${row.length} cells; expected ${n} to match columns`,
          path: ["rows", i],
        });
      }
    });
  });

const serviceAreaBlock = baseBlock.extend({
  type: z.literal("service_area"),
  locations: z.array(z.string()).min(1),
}).strict();

/** Unknown `type` values fail: no branch of the union matches. */
export const contentBlockSchema = z.union([
  introBlock,
  quickAnswerBlock,
  sectionBlock,
  comparisonBlock,
  bulletsBlock,
  ctaBlock,
  faqBlock,
  paragraphBlock,
  keyTakeawaysBlock,
  imageBlock,
  quoteBlock,
  internalLinksBlock,
  comparisonTableBlock,
  serviceAreaBlock,
]);

export const blogContentJsonSchema = z
  .object({
    schema_version: z.literal(BLOG_CONTENT_JSON_SCHEMA_VERSION),
    blocks: z.array(contentBlockSchema),
  })
  .strict();

export function parseBlogContentJson(value: unknown): BlogContentJson {
  return blogContentJsonSchema.parse(value) as BlogContentJson;
}

export function safeParseBlogContentJson(
  value: unknown
): z.SafeParseReturnType<unknown, BlogContentJson> {
  return blogContentJsonSchema.safeParse(value) as z.SafeParseReturnType<
    unknown,
    BlogContentJson
  >;
}
