# Coinbase Onramp — Apple Pay

A production-ready Astro website for fiat-to-crypto purchases via Apple Pay,
powered by Coinbase's headless Onramp v2 API and CDP Embedded Wallets.

## Features

- **CDP Embedded Wallets** — users sign in with email OTP; their EVM address auto-populates as the destination
- **Apple Pay** — native payment via Coinbase's `GUEST_CHECKOUT_APPLE_PAY` payment method
- **Production API** — calls `POST https://api.cdp.coinbase.com/platform/v2/onramp/orders`
- **Real-time events** — listens to postMessage from the iframe (`onramp_api.*`)
- **Astro + Vercel** — serverless API route handles JWT signing server-side; credentials never exposed to the browser

---

## Quick Start (local)

```bash
# 1. Install dependencies
npm install

# 2. .env is already pre-filled with your credentials
# (see .env — never commit this file!)

# 3. Start dev server
npm run dev
# → http://localhost:4321
```

> **Note:** On localhost, `useApplePaySandbox=true` is appended to the iframe URL automatically.
> Apple Pay won't show a real payment sheet — you'll see a simulated/QR code experience.
> For a real Apple Pay button you must deploy to HTTPS and complete domain registration (see below).

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "feat: coinbase onramp apple pay"
gh repo create coinbase-onramp-applepay --public --push --source=.
```

### 2. Import in Vercel

1. Go to https://vercel.com/new → Import your repo
2. Framework: **Astro** (auto-detected)
3. Set these **Environment Variables** in Vercel dashboard → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `PUBLIC_CDP_PROJECT_ID` | `a353ad87-5af2-4bc7-af5b-884e6aabf088` |
| `CDP_API_KEY` | `f256c5ed-26f0-40d2-8bd4-fd3d89150421` |
| `CDP_API_SECRET` | `IB9byzqDJgH5qHLTidt9Zt8Dk6mguWd7G6mTLkWGvqm5Rxk0+wgBTmBvm+RWI1bB2HJ3E/dTy6FNhRY0tRzwEg==` |
| `COINBASE_APP_ID` | `a353ad87-5af2-4bc7-af5b-884e6aabf088` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` ← update after first deploy |

4. Click **Deploy**

---

## Apple Pay Domain Registration (required for production iframe)

For Apple Pay to show a real payment sheet embedded in an iframe, your domain must be
registered with Coinbase **and** verified with Apple:

1. **Register domain with Coinbase**
   - Go to CDP Portal → Onramp → [Domain Allowlist](https://portal.cdp.coinbase.com/products/onramp)
   - Add your Vercel domain (e.g. `coinbase-onramp-applepay.vercel.app`)
   - Coinbase will provide a domain verification file

2. **Host verification file**
   Place the file at: `/.well-known/apple-developer-merchantid-domain-association`
   Put it in the `public/.well-known/` directory of this repo.

3. **Schedule a call with Coinbase**
   Apple Pay web integration requires a brief onboarding with the Coinbase team.
   → [Schedule here](https://docs.cdp.coinbase.com/onramp/headless-onramp/overview#contact-us)

---

## Project Structure

```
src/
├── pages/
│   ├── index.astro           # Main page
│   └── api/
│       └── apple-pay-order.ts  # Server endpoint — creates CDP order, signs JWT
├── components/
│   ├── ApplePayApp.tsx       # CDPReactProvider wrapper (React island)
│   └── ApplePayWidget.tsx    # Full Apple Pay form + iframe + success state
└── layouts/
    └── Layout.astro          # Base HTML shell
```

## API Route: `POST /api/apple-pay-order`

| Field | Description |
|-------|-------------|
| `email` | User's verified email |
| `phoneNumber` | US phone `+1XXXXXXXXXX` |
| `amount` | USD amount (≥ $5) |
| `asset` | `USDC`, `ETH`, `cbBTC`, `EURC` |
| `network` | `base`, `ethereum`, `polygon`, `arbitrum`, `optimism` |
| `destinationAddress` | EVM wallet address |

**Returns:** `{ orderId, paymentLinkUrl, partnerUserRef }`

The `paymentLinkUrl` is loaded in an iframe — it renders the Apple Pay button.

---

## Environment Variables Reference

```bash
# Public (exposed to browser — safe)
PUBLIC_CDP_PROJECT_ID=       # CDP Project ID (also used as App ID)

# Private (server-side only — never expose to browser)
CDP_API_KEY=                 # CDP API Key ID (UUID)
CDP_API_SECRET=              # CDP API Private Key (base64 Ed25519)
COINBASE_APP_ID=             # Same as project ID, used in hosted onramp URLs
ALLOWED_ORIGINS=             # Comma-separated CORS allowlist
```

---

## Resources

- [Coinbase Onramp Apple Pay Docs](https://docs.cdp.coinbase.com/onramp/headless-onramp/overview)
- [CDP Portal](https://portal.cdp.coinbase.com)
- [Onramp Demo App (reference)](https://github.com/coinbase/onramp-demo-application)
- [CDP Embedded Wallets](https://docs.cdp.coinbase.com/embedded-wallets/quickstart)
