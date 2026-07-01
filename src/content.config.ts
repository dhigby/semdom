import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    menuTitle: z.string().optional(),
    menuOrder: z.number().optional(),
    showInMenu: z.boolean().default(true),
  }),
});

export const collections = { pages };
