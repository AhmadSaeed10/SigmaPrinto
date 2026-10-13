// One source of truth for content rules. Used by Astro's content config (build-time checks)
// and by the admin panel (form generation and save validation), so both always agree.
//
// UI hints live in `.meta({ ui, label, help })`. The admin form builder reads them:
//   ui: 'textarea' | 'markdown' | 'image' | 'tags' (default is inferred from the type)
import { z } from 'astro/zod';

// Images are stored in src/assets and referenced from content files by a relative path.
// The build turns that path into an optimised image; the admin validates the plain path.
export const ASSET_PATH = /^\.\.\/\.\.\/assets\/[a-z0-9][a-z0-9-]*\.webp$/;
export const adminImage = () => z.string().regex(ASSET_PATH, 'Choose an image from Media');
type ImageField = () => z.ZodType;

export const serviceSchema = (image: ImageField) =>
  z
    .object({
      title: z.string().min(2).max(80).meta({ label: 'Title' }),
      order: z.number().int().min(1).max(99).meta({ label: 'Order', help: 'Position in service lists. 1 shows first.' }),
      summary: z.string().min(10).max(200).meta({ ui: 'textarea', label: 'Summary', help: 'Shown in lists and at the top of the page.' }),
      spec: z.string().min(2).max(60).meta({ label: 'Short spec', help: 'One line under the title, e.g. "Flex, vinyl, posters".' }),
      items: z.array(z.string().min(1).max(60)).min(1).meta({ ui: 'tags', label: 'What is included', help: 'Press Enter after each item.' }),
      suitableFor: z.string().min(2).max(120).meta({ label: 'Best for' }),
      seoTitle: z.string().min(10).max(60).meta({ label: 'SEO title', help: 'Up to 60 characters.' }),
      seoDescription: z.string().min(50).max(160).meta({ ui: 'textarea', label: 'SEO description', help: '50 to 160 characters.' }),
      image: image().optional().meta({ ui: 'image', label: 'Main image', help: 'Leave empty to use the illustration.' }),
      imageAlt: z.string().max(140).optional().meta({ label: 'Main image alt text', help: 'Describe the image for screen readers.' }),
      gallery: z
        .array(
          z.object({
            image: image().meta({ ui: 'image', label: 'Image' }),
            alt: z.string().min(3).max(140).meta({ label: 'Alt text' }),
          }),
        )
        .max(24)
        .optional()
        .meta({ label: 'Gallery', itemLabel: 'image', help: 'Photos of finished work for this service.' }),
    })
    .superRefine((d, ctx) => {
      if (d.image && !d.imageAlt?.trim()) ctx.addIssue({ code: 'custom', path: ['imageAlt'], message: 'Alt text is required when an image is set' });
    });

export const guideSchema = z.object({
  title: z.string().min(5).max(90).meta({ label: 'Title' }),
  description: z.string().min(20).max(160).meta({ ui: 'textarea', label: 'Description', help: 'Used for search results. Up to 160 characters.' }),
  date: z.coerce.date().meta({ label: 'Publish date' }),
  draft: z.boolean().default(false).meta({ label: 'Draft', help: 'Drafts are hidden from the site.' }),
});

export const faqsSchema = z.object({
  faqs: z
    .array(
      z.object({
        q: z.string().min(5).max(160).meta({ label: 'Question' }),
        a: z.string().min(5).max(600).meta({ ui: 'textarea', label: 'Answer' }),
      }),
    )
    .min(1)
    .meta({ label: 'Questions', itemLabel: 'question' }),
});

const phone = z.string().max(30).regex(/^[+\d\s()-]*$/, 'Digits, spaces and + only');
export const siteSchema = z.object({
  name: z.string().min(2).max(60).meta({ label: 'Business name' }),
  url: z.url().meta({ label: 'Site URL', help: 'The live address. Analytics only counts visits on this host.' }),
  tagline: z.string().max(80).meta({ label: 'Tagline' }),
  description: z.string().min(50).max(300).meta({ ui: 'textarea', label: 'Site description', help: 'Default description for search results.' }),
  email: z.email().meta({ label: 'Email' }),
  phone: phone.meta({ label: 'Phone' }),
  whatsapp: z.string().regex(/^\d{8,15}$|^$/, 'Digits only, with country code, e.g. 923001234567').meta({ label: 'WhatsApp number', help: 'Digits only with country code. Empty sends quotes by email instead.' }),
  ga4: z.string().regex(/^G-[A-Z0-9]{6,12}$|^$/, 'Looks like G-XXXXXXX').meta({ label: 'GA4 measurement ID' }),
  address: z.string().max(160).meta({ label: 'Street address' }),
  city: z.string().max(60).meta({ label: 'City' }),
  hours: z.string().max(80).meta({ label: 'Opening hours', help: 'e.g. Mon to Sat, 9am to 7pm' }),
});

export type SiteSettings = z.infer<typeof siteSchema>;
