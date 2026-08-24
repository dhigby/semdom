import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    menuTitle: z.string().optional(),
    menuOrder: z.number().optional(),
    showInMenu: z.boolean().default(true),
    /** Groups a page under a hub page rather than the main nav. Only 'about' is
     * used today; it drives the /about/ card grid and the reading-sequence pager. */
    section: z.string().optional(),
    /** One sentence. Becomes the page's meta description and its hub card subtitle. */
    summary: z.string().optional(),
  }),
});

export const collections = { pages };
