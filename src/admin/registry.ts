// What the admin can edit. Add a content type here and it appears in the sidebar,
// list, form and API automatically. Server-only (imports zod schemas).
import type { z } from 'astro/zod';
import { adminImage, faqsSchema, guideSchema, serviceSchema, siteSchema } from '../lib/schemas';

interface Base { key: string; label: string; singular: string; icon: string; schema: z.ZodType }
export interface CollectionType extends Base {
  kind: 'collection';
  dir: string;              // markdown files live here, one per entry
  publicPath?: string;      // where the entry shows on the site, for "View" links
  titleField: string;
  subtitleField?: string;
  sortField?: string;       // ascending number or descending date
  bodyLabel: string;
  bodyHelp?: string;
}
export interface SingletonType extends Base {
  kind: 'singleton';
  path: string;             // one JSON file
  help?: string;
}
export type ContentType = CollectionType | SingletonType;

export const contentTypes: ContentType[] = [
  {
    key: 'services', label: 'Services', singular: 'service', icon: 'layers', kind: 'collection',
    dir: 'src/content/services', publicPath: '/services/', schema: serviceSchema(adminImage),
    titleField: 'title', subtitleField: 'spec', sortField: 'order',
    bodyLabel: 'Page text', bodyHelp: 'Shown on the service page under the header. Markdown is supported.',
  },
  {
    key: 'guides', label: 'Guides', singular: 'guide', icon: 'book', kind: 'collection',
    dir: 'src/content/guides', publicPath: '/guides/', schema: guideSchema,
    titleField: 'title', subtitleField: 'description', sortField: 'date',
    bodyLabel: 'Article', bodyHelp: 'Markdown is supported. Use ## for section headings.',
  },
  {
    key: 'faqs', label: 'FAQs', singular: 'FAQ list', icon: 'help', kind: 'singleton',
    path: 'src/data/faqs.json', schema: faqsSchema, help: 'Shown on the homepage, in this order.',
  },
  {
    key: 'settings', label: 'Site settings', singular: 'settings', icon: 'settings', kind: 'singleton',
    path: 'src/data/site.json', schema: siteSchema, help: 'Business details used across the whole site.',
  },
];

export const MEDIA_DIR = 'src/assets';
export const MEDIA_INDEX = 'src/data/media.json';

export const getType = (key: string) => contentTypes.find((t) => t.key === key);
