import { defineConfig } from 'astro/config';

// TEMPORARY: base is set for testing at https://dhigby.github.io/semdom/ before
// DNS points semdom.org at GitHub Pages. Once the custom domain is live and the
// site serves from the domain root, remove `base` entirely (or set it to '/').
export default defineConfig({
  site: 'https://semdom.org',
  base: '/semdom',
  trailingSlash: 'always',
});
