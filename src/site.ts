// Business details. Edited in the admin panel (Site settings), stored in src/data/site.json.
// Empty values are hidden in the UI.
import data from './data/site.json';
import type { SiteSettings } from './lib/schemas';

export const site: SiteSettings = data;
