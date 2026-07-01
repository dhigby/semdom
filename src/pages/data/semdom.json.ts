import type { APIRoute } from 'astro';
import { getAllDomains } from '../../lib/semdom';

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(getAllDomains(), null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
