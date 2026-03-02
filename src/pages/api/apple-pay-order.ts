import type { APIRoute } from 'astro';

export const prerender = false;

// Simple in-memory rate limiter per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

function getAllowedOrigins(): string[] {
  const raw = import.meta.env.ALLOWED_ORIGINS || '';
  const defaults = ['http://localhost:4321', 'http://localhost:3000'];
  if (!raw) return defaults;
  return [
    ...raw.split(',').map((o: string) => o.trim()).filter(Boolean),
    ...defaults,
  ];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  if (!origin) return {};

  // Also allow any *.vercel.app subdomain for preview deployments
  const isVercelPreview = origin.endsWith('.vercel.app');

  if (!allowed.includes(origin) && !isVercelPreview) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  if (!Object.keys(headers).length) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 204, headers });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);

  // Block non-allowed origins (but allow no-origin for server-to-server)
  if (origin && !Object.keys(cors).length) {
    return json({ error: 'Unauthorized origin' }, 403);
  }

  // Rate limiting
  const clientIpRaw =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    clientAddress ||
    '0.0.0.0';

  if (!checkRateLimit(clientIpRaw)) {
    return json({ error: 'Too many requests. Try again later.' }, 429, cors);
  }

  // Validate credentials
  const keyId = import.meta.env.CDP_API_KEY;
  const keySecret = import.meta.env.CDP_API_SECRET;

  if (!keyId || !keySecret) {
    console.error('[apple-pay-order] Missing CDP credentials in environment');
    return json({ error: 'Server configuration error' }, 500, cors);
  }

  // Parse body
  let body: {
    email?: string;
    phoneNumber?: string;
    amount?: number | string;
    asset?: string;
    network?: string;
    destinationAddress?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  const { email, phoneNumber, amount, asset = 'USDC', network = 'base', destinationAddress } = body;

  // Required field validation
  const missing: string[] = [];
  if (!email) missing.push('email');
  if (!phoneNumber) missing.push('phoneNumber');
  if (!destinationAddress) missing.push('destinationAddress');

  if (missing.length) {
    return json({ error: `Missing required fields: ${missing.join(', ')}` }, 400, cors);
  }

  // Phone format validation (US only: +1XXXXXXXXXX)
  if (!/^\+1\d{10}$/.test(phoneNumber!)) {
    return json(
      { error: 'Phone number must be in format +1XXXXXXXXXX (US numbers only)' },
      400,
      cors,
    );
  }

  // Amount validation
  const parsedAmount = Number(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount < 5) {
    return json({ error: 'Amount must be a number ≥ $5 USD' }, 400, cors);
  }

  // Generate CDP JWT
  let jwtToken: string;
  try {
    const { generateJwt } = await import('@coinbase/cdp-sdk/auth');

    // Handle possible \\n escaping from env files
    const processedSecret = keySecret.includes('\\n')
      ? keySecret.replace(/\\n/g, '\n')
      : keySecret;

    jwtToken = await generateJwt({
      apiKeyId: keyId,
      apiKeySecret: processedSecret,
      requestMethod: 'POST',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: '/platform/v2/onramp/orders',
      expiresIn: 120,
    });
  } catch (err) {
    console.error('[apple-pay-order] JWT generation failed:', err);
    return json({ error: 'Authentication failed — check CDP credentials' }, 500, cors);
  }

  // Resolve client IP (CDP rejects private/loopback addresses)
  let clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    clientAddress ||
    '';

  const isPrivate =
    !clientIp ||
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp.startsWith('10.') ||
    clientIp.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clientIp) ||
    clientIp === 'localhost';

  if (isPrivate) {
    // RFC 5737 test address — acceptable for development
    clientIp = '192.0.2.1';
  }

  // Build request body
  const now = new Date().toISOString();
  // Production mode: no "sandbox-" prefix
  const partnerUserRef = `${email!.split('@')[0]}-${Date.now()}`;

  const orderBody: Record<string, string | boolean> = {
    partnerUserRef,
    email: email!,
    phoneNumber: phoneNumber!,
    paymentAmount: parsedAmount.toFixed(2),
    paymentCurrency: 'USD',
    purchaseCurrency: asset,
    paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
    destinationAddress: destinationAddress!,
    destinationNetwork: network,
    agreementAcceptedAt: now,
    phoneNumberVerifiedAt: now,
    clientIp,
    isQuote: false,
  };

  // Include domain for HTTPS origins (required for iframe embedding)
  if (origin?.startsWith('https://')) {
    orderBody.domain = origin.replace('https://', '');
  }

  // Call Coinbase v2 Onramp Order API
  let cdpResponse: Response;
  try {
    cdpResponse = await fetch('https://api.cdp.coinbase.com/platform/v2/onramp/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify(orderBody),
    });
  } catch (err) {
    console.error('[apple-pay-order] Fetch to CDP API failed:', err);
    return json({ error: 'Failed to reach Coinbase API' }, 502, cors);
  }

  const responseText = await cdpResponse.text();

  if (!cdpResponse.ok) {
    let errorMessage = 'Failed to create Apple Pay order';
    try {
      const errData = JSON.parse(responseText);
      errorMessage = errData.errorMessage || errData.message || errorMessage;

      if (errorMessage.toLowerCase().includes('not allow listed')) {
        errorMessage = `Domain "${origin}" is not allow-listed. Add it in CDP Portal → Onramp → Domain Allowlist.`;
      }
    } catch {
      // Non-JSON error body — use generic message
    }

    console.error('[apple-pay-order] CDP error:', cdpResponse.status, responseText);
    return json({ error: errorMessage }, cdpResponse.status, cors);
  }

  const data = JSON.parse(responseText) as {
    order?: { orderId?: string };
    paymentLink?: { url?: string };
  };

  return json(
    {
      orderId: data.order?.orderId ?? null,
      paymentLinkUrl: data.paymentLink?.url ?? null,
      partnerUserRef,
    },
    200,
    cors,
  );
};

// Helper
function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
