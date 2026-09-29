import type { CollectionEntry } from 'astro:content';

// A service shows its own photo when `image` is set in frontmatter, otherwise its illustration.
export function serviceImage(entry: CollectionEntry<'services'>) {
  const { image, imageAlt, title } = entry.data;
  return {
    src: image ?? `/services/${entry.id}.svg`,
    alt: imageAlt ?? `Illustration of ${title.toLowerCase()}`,
  };
}
