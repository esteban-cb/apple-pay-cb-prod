/**
 * GET /api/webhook-events
 * Returns stored webhook events for the UI to poll.
 */
import type { APIRoute } from 'astro';
import fs from 'fs';

export const prerender = false;

const FILE = '/tmp/onramp-webhook-events.json';

export const GET: APIRoute = async () => {
  try {
    if (fs.existsSync(FILE)) {
      const events = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      return new Response(JSON.stringify({ events }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {}
  return new Response(JSON.stringify({ events: [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
