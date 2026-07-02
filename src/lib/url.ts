/** Prefixes an absolute in-site path with the configured base path (see astro.config.mjs).
 * Needed because Astro does not rewrite hardcoded href="/..." strings itself. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + path;
}
