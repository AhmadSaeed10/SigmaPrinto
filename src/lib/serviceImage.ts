import type { CollectionEntry } from 'astro:content';

// A service shows its own photo when `image` is set (an optimised asset from src/assets),
// otherwise its illustration from /public/services.
export function serviceImage(entry: CollectionEntry<'services'>) {
  const { image, imageAlt, title } = entry.data;
  return {
    src: image ? image.src : `/services/${entry.id}.svg`,
    alt: image ? imageAlt ?? '' : `Illustration of ${title.toLowerCase()}`,
  };
}
