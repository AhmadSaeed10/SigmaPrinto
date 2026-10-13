import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { guideSchema, serviceSchema } from './lib/schemas';

// Schemas live in src/lib/schemas.ts so the admin panel validates against the same rules.
const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: ({ image }) => serviceSchema(image),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: guideSchema,
});

export const collections = { services, guides };
