/**
 * POST /api/register-webhook
 * Registers a Coinbase Onramp webhook subscription pointing at /api/webhook.
 * Called once by the frontend on load. Idempotent — re-registering is harmless.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const keyId     = import.meta.env.CDP_API_KEY;
  const keySecret = import.meta.env.CDP_API_SECRET;

  if (!keyId || !keySecret) {
    return json({ error: 'Missing CDP credentials' }, 500);
  }

  let origin: string;
  try {
    ({ origin } = await request.json());
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  if (!origin || !origin.startsWith('https://')) {
    // Webhooks only work on public HTTPS — skip registration on localhost
    return json({ skipped: true, reason: 'Webhooks require an HTTPS origin (deploy to Vercel first)' }, 200);
  }

  try {
    const { generateJwt } = await import('@coinbase/cdp-sdk/auth');

    const processedSecret = keySecret.includes('\\n')
      ? keySecret.replace(/\\n/g, '\n')
      : keySecret;

    const jwtToken = await generateJwt({
      apiKeyId: keyId,
      apiKeySecret: processedSecret,
      requestMethod: 'POST',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: '/platform/v2/data/webhooks/subscriptions',
      expiresIn: 120,
    });

    const webhookUrl = `${origin}/api/webhook`;

    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/webhooks/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        description: 'Onramp transaction status webhook',
        eventTypes: [
          'onramp.transaction.created',
          'onramp.transaction.updated',
          'onramp.transaction.success',
          'onramp.transaction.failed',
        ],
        target: { url: webhookUrl, method: 'POST' },
        labels: {},
        isEnabled: true,
      }),
    });

    const data = await res.json();
    return json({ webhookUrl, subscription: data }, res.status);
  } catch (err) {
    console.error('[register-webhook]', err);
    return json({ error: 'Failed to register webhook' }, 500);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
