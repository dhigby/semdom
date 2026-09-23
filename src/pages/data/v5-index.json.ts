import type { APIRoute } from 'astro';
import { loadVersion } from '../../../scripts/lib/domains.mjs';

export const prerender = true;

/**
 * Code + name for every v5 domain, and nothing else — about 14 KB gzipped, against
 * 400 KB for the full records. It is everything /propose/ needs: the parent picker,
 * the related-domain picker, and the arithmetic for a new domain's provisional number.
 *
 * v5 alone is enough for that arithmetic even though a number must be free in *both*
 * versions, because deleting a domain is forbidden — so every v4 code is also a v5
 * code, and v5 is the union. If that ever stops being true, validate.mjs fails first.
 *
 * GUIDs are deliberately left out: shipping 3,594 of them to check a collision whose
 * odds are about 2^-122 would cost 130 KB, and apply-proposal.mjs checks it properly.
 */
export const GET: APIRoute = () => {
  const { ordered } = loadVersion('v5');
  const domains = ordered.map((d) => [d.code, d.name]);
  return new Response(JSON.stringify({ domains }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
