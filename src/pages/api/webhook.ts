/**
 * POST /api/webhook
 * Receives real-time Onramp transaction events from Coinbase.
 * Stores events to /tmp so webhook-events.ts can serve them to the UI.
 */
import type { APIRoute } from 'astro';
import fs from 'fs';

export const prerender = false;

const FILE = '/tmp/onramp-webhook-events.json';

function read(): object[] {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {}
  return [];
}

function write(events: object[]): void {
  try { fs.writeFileSync(FILE, JSON.stringify(events)); } catch {}
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const events = read();
    events.unshift({ ...body, _receivedAt: new Date().toISOString() });
    write(events.slice(0, 100));
    return new Response('OK', { status: 200 });
  } catch {
    return new Response('Bad request', { status: 400 });
  }
};
