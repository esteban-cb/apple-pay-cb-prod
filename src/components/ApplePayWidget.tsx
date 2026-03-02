import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { useEvmAddress, useIsSignedIn } from '@coinbase/cdp-hooks';
import { AuthButton } from '@coinbase/cdp-react/components/AuthButton';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'form' | 'loading' | 'iframe' | 'success';

interface WebhookEvent {
  eventType?: string;
  type?: string;
  data?: {
    orderId?: string;
    partnerUserRef?: string;
    status?: string;
    txHash?: string;
    purchaseCurrency?: string;
    purchaseAmount?: string;
    paymentAmount?: string;
    paymentCurrency?: string;
  };
  _receivedAt: string;
}

const ASSETS   = ['USDC', 'ETH', 'cbBTC', 'EURC'];
const NETWORKS: Record<string, string[]> = {
  USDC:  ['base', 'ethereum', 'polygon', 'arbitrum'],
  ETH:   ['ethereum', 'base', 'arbitrum', 'optimism'],
  cbBTC: ['base', 'ethereum'],
  EURC:  ['base', 'ethereum'],
};
const NETWORK_LABELS: Record<string, string> = {
  base: 'Base', ethereum: 'Ethereum', polygon: 'Polygon',
  arbitrum: 'Arbitrum', optimism: 'Optimism',
};

// ─── Wallet bar ───────────────────────────────────────────────────────────────

function WalletBar({ onAddress }: { onAddress: (addr: string) => void }) {
  const { isSignedIn }  = useIsSignedIn();
  const { evmAddress }  = useEvmAddress();
  const [manual, setManual] = useState(false);
  const [input, setInput]   = useState('');

  // Auto-forward embedded wallet address
  useEffect(() => {
    if (isSignedIn && evmAddress) onAddress(evmAddress);
  }, [isSignedIn, evmAddress, onAddress]);

  if (isSignedIn && evmAddress) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 mb-4">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">CDP Wallet</span>
        <span className="text-xs font-mono text-gray-400 truncate">
          {evmAddress.slice(0, 10)}…{evmAddress.slice(-8)}
        </span>
      </div>
    );
  }

  if (manual) {
    return (
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2.5 rounded-xl border border-[#1e2737] bg-[#0d1117] text-xs font-mono text-gray-200 placeholder-gray-700 focus:outline-none focus:border-[#0052FF]"
          />
          <button
            onClick={() => { if (/^0x[0-9a-fA-F]{40}$/.test(input)) onAddress(input); }}
            disabled={!/^0x[0-9a-fA-F]{40}$/.test(input)}
            className="px-3 py-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0040CC] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Use
          </button>
        </div>
        <button onClick={() => setManual(false)} className="text-[11px] text-gray-700 hover:text-gray-500">
          ← Back to sign-in
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex justify-center">
        <AuthButton />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-[#1e2737]" />
        <span className="text-[10px] text-gray-700">or</span>
        <div className="flex-1 h-px bg-[#1e2737]" />
      </div>
      <button
        onClick={() => setManual(true)}
        className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        Enter wallet address manually →
      </button>
    </div>
  );
}

// ─── Webhook panel ────────────────────────────────────────────────────────────

function WebhookPanel() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [registered, setRegistered] = useState(false);

  // Register webhook once on mount (only on HTTPS)
  useEffect(() => {
    const origin = window.location.origin;
    setWebhookUrl(`${origin}/api/webhook`);

    fetch('/api/register-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin }),
    })
      .then(r => r.json())
      .then(d => { if (!d.skipped && !d.error) setRegistered(true); })
      .catch(() => {});
  }, []);

  // Poll for new events every 3 s
  useEffect(() => {
    const poll = () =>
      fetch('/api/webhook-events')
        .then(r => r.json())
        .then(d => setEvents(d.events || []))
        .catch(() => {});

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  function eventColor(type: string) {
    if (type.includes('success')) return 'text-emerald-400';
    if (type.includes('failed'))  return 'text-red-400';
    if (type.includes('updated')) return 'text-yellow-400';
    return 'text-blue-400';
  }

  function eventDot(type: string) {
    if (type.includes('success')) return 'bg-emerald-400';
    if (type.includes('failed'))  return 'bg-red-400';
    if (type.includes('updated')) return 'bg-yellow-400';
    return 'bg-blue-400';
  }

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <div className="mt-4 bg-[#0d1117] border border-[#1e2737] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2737]">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${registered ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
          <span className="text-xs font-semibold text-gray-400">Live Webhook Events</span>
        </div>
        <span className="text-[10px] font-mono text-gray-700">{events.length} received</span>
      </div>

      {/* Webhook URL */}
      <div className="px-4 py-2.5 border-b border-[#1e2737] bg-[#0a0e18]">
        <div className="text-[10px] text-gray-700 mb-1 uppercase tracking-widest">Endpoint</div>
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono text-[#5B8DEF] break-all">{webhookUrl || 'loading…'}</code>
          {webhookUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
              title="Copy"
              className="flex-shrink-0 text-gray-700 hover:text-gray-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          )}
        </div>
        {!isHttps && (
          <p className="mt-1.5 text-[10px] text-yellow-600">
            ⚠ Webhooks require HTTPS — deploy to Vercel to receive live events
          </p>
        )}
      </div>

      {/* Events feed */}
      <div className="max-h-52 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-gray-700">
            Waiting for events… complete a transaction to see updates here.
          </div>
        ) : (
          events.map((ev, i) => {
            const type = ev.eventType ?? ev.type ?? 'unknown';
            const ts   = new Date(ev._receivedAt).toLocaleTimeString('en-US', { hour12: false });
            return (
              <div key={i} className="px-4 py-3 border-b border-[#1e2737]/50 last:border-0 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${eventDot(type)}`} />
                  <span className={`text-[11px] font-mono font-semibold ${eventColor(type)}`}>{type}</span>
                  <span className="ml-auto text-[10px] font-mono text-gray-700">{ts}</span>
                </div>
                {ev.data && (
                  <div className="pl-3.5 space-y-0.5">
                    {ev.data.orderId && (
                      <div className="text-[10px] font-mono text-gray-600">
                        order <span className="text-gray-500">{ev.data.orderId.slice(0, 16)}…</span>
                      </div>
                    )}
                    {ev.data.status && (
                      <div className="text-[10px] font-mono text-gray-600">
                        status <span className="text-gray-400">{ev.data.status}</span>
                      </div>
                    )}
                    {ev.data.purchaseAmount && (
                      <div className="text-[10px] font-mono text-gray-600">
                        received <span className="text-emerald-400">{ev.data.purchaseAmount} {ev.data.purchaseCurrency}</span>
                      </div>
                    )}
                    {ev.data.txHash && (
                      <a
                        href={`https://basescan.org/tx/${ev.data.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-[#5B8DEF] hover:underline"
                      >
                        {ev.data.txHash.slice(0, 20)}… ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function ApplePayWidget() {
  const [step, setStep]     = useState<Step>('form');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [amount, setAmount] = useState('20');
  const [asset, setAsset]   = useState('USDC');
  const [network, setNetwork] = useState('base');
  const [address, setAddress] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [orderId, setOrderId]     = useState('');
  const [error, setError]         = useState('');
  const [iframeLogs, setIframeLogs] = useState<string[]>([]);

  const { isSignedIn } = useIsSignedIn();
  const { evmAddress } = useEvmAddress();

  // Keep address in sync with embedded wallet
  useEffect(() => {
    if (isSignedIn && evmAddress) setAddress(evmAddress);
  }, [isSignedIn, evmAddress]);

  const handleAssetChange = (val: string) => {
    setAsset(val);
    const nets = NETWORKS[val] ?? [];
    if (!nets.includes(network)) setNetwork(nets[0] ?? 'base');
  };

  // postMessage listener for iframe events
  const iframeLogsRef = useRef(iframeLogs);
  useEffect(() => { iframeLogsRef.current = iframeLogs; }, [iframeLogs]);

  const addIframeLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setIframeLogs(p => [...p, `[${ts}] ${msg}`]);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.origin.includes('coinbase.com')) return;
      let parsed: { eventName?: string; data?: Record<string, string> };
      try { parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
      catch { return; }
      const { eventName, data } = parsed;
      if (!eventName) return;
      addIframeLog(`${eventName}${data?.errorMessage ? ' — ' + data.errorMessage : ''}`);
      if (eventName === 'onramp_api.polling_success') {
        setStep('success');
        const colors = ['#0052FF', '#00D395', '#FFB800'];
        const end = Date.now() + 3000;
        (function frame() {
          confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
          confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
          if (Date.now() < end) requestAnimationFrame(frame);
        })();
      }
      if (['onramp_api.load_error', 'onramp_api.commit_error', 'onramp_api.polling_error'].includes(eventName)) {
        setError(data?.errorMessage || 'Transaction error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addIframeLog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('loading');
    setIframeLogs([]);
    try {
      const res = await fetch('/api/apple-pay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phoneNumber: phone, amount: parseFloat(amount), asset, network, destinationAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      if (!data.paymentLinkUrl) throw new Error('No payment link returned');
      setOrderId(data.orderId ?? '');
      let url: string = data.paymentLinkUrl;
      if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        url += (url.includes('?') ? '&' : '?') + 'useApplePaySandbox=true';
      }
      setIframeUrl(url);
      setStep('iframe');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('form');
    }
  };

  const reset = () => {
    setStep('form'); setIframeUrl(''); setError('');
    setIframeLogs([]); setOrderId('');
    if (!evmAddress) setAddress('');
  };

  const card = 'bg-[#111827] border border-[#1e2737] rounded-2xl shadow-2xl overflow-hidden';

  // ── SUCCESS ─────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <>
        <div className={`${card} p-8 text-center`}>
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Payment Complete!</h2>
          <p className="text-gray-500 text-sm mb-1">{asset} sent to your wallet on {NETWORK_LABELS[network]}.</p>
          {orderId && <p className="text-[11px] font-mono text-gray-700 mb-5">Order: {orderId}</p>}
          <button onClick={reset} className="w-full py-3 rounded-xl bg-[#0052FF] hover:bg-[#0040CC] text-white font-semibold text-sm transition-all">
            New Transaction
          </button>
        </div>
        <WebhookPanel />
      </>
    );
  }

  // ── IFRAME ───────────────────────────────────────────────────────────────────
  if (step === 'iframe') {
    return (
      <>
        <div className={`${card}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2737]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300 font-medium">Secure Apple Pay Checkout</span>
            </div>
            <button onClick={reset} className="text-gray-600 hover:text-gray-300 text-sm transition-colors">← Back</button>
          </div>
          {error && <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <iframe
            src={iframeUrl}
            className="w-full border-0"
            style={{ height: '520px' }}
            title="Apple Pay Checkout"
            allow="payment"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
          {iframeLogs.length > 0 && (
            <div className="mx-4 mb-4 p-3 rounded-xl bg-[#0a0e1a] border border-[#1e2737]">
              <div className="text-[10px] font-mono text-gray-700 mb-1.5 uppercase tracking-widest">iframe events</div>
              {iframeLogs.map((l, i) => <div key={i} className="text-[11px] font-mono text-gray-600">{l}</div>)}
            </div>
          )}
        </div>
        <WebhookPanel />
      </>
    );
  }

  // ── FORM ─────────────────────────────────────────────────────────────────────
  const nets = NETWORKS[asset] ?? ['base'];
  const isLoading = step === 'loading';
  const walletFromCDP = isSignedIn && !!evmAddress && address === evmAddress;

  return (
    <>
      <div className={card}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[#1e2737]">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="black" width={18} height={18}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Buy with Apple Pay</h2>
            <p className="text-xs text-gray-600">Coinbase Onramp v2</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          {/* ── Wallet connect ── */}
          <WalletBar onAddress={setAddress} />

          {/* Email */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Email *</label>
            <input
              type="email" required value={email} disabled={isLoading}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 placeholder-gray-700 focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">US Phone *</label>
            <input
              type="tel" required value={phone} disabled={isLoading}
              onChange={e => setPhone(e.target.value)}
              placeholder="+12025551234"
              className="w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 placeholder-gray-700 focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all"
            />
            <p className="mt-1 text-[11px] text-gray-700">+1XXXXXXXXXX · US only</p>
          </div>

          {/* Wallet address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Wallet Address *</label>
              {walletFromCDP && (
                <span className="text-[10px] text-emerald-500">from CDP wallet</span>
              )}
            </div>
            <input
              type="text" required value={address} disabled={isLoading}
              readOnly={walletFromCDP}
              onChange={e => { if (!walletFromCDP) setAddress(e.target.value); }}
              placeholder="0x..."
              className={`w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 placeholder-gray-700 font-mono focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all ${walletFromCDP ? 'opacity-70 cursor-default' : ''}`}
            />
          </div>

          {/* Amount + Asset */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Amount (USD)</label>
              <input
                type="number" required min="5" step="1" value={amount} disabled={isLoading}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Asset</label>
              <div className="relative">
                <select value={asset} disabled={isLoading} onChange={e => handleAssetChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 appearance-none cursor-pointer focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all">
                  {ASSETS.map(a => <option key={a}>{a}</option>)}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Network */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Network</label>
            <div className="relative">
              <select value={network} disabled={isLoading} onChange={e => setNetwork(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#1e2737] bg-[#0d1117] text-sm text-gray-100 appearance-none cursor-pointer focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 transition-all">
                {nets.map(n => <option key={n} value={n}>{NETWORK_LABELS[n] ?? n}</option>)}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !email || !phone || !address}
            className="w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-black hover:bg-[#111] border border-[#444] hover:border-[#666] text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Creating order…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="white" width={16} height={16}>
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Pay with Apple Pay
              </>
            )}
          </button>

          <p className="text-[10px] text-gray-700 text-center">
            US residents only · $5 minimum · Powered by Coinbase Onramp
          </p>
        </form>
      </div>

      {/* Webhook events panel always visible below */}
      <WebhookPanel />
    </>
  );
}
