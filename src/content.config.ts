import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    summary: z.string().max(200),
    items: z.array(z.string()),
    suitableFor: z.string(),
    seoTitle: z.string().max(60),
    seoDescription: z.string().max(160),
    spec: z.string(), // short line shown in the index, e.g. "Vinyl, flex, 13oz+"
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { services, guides };
