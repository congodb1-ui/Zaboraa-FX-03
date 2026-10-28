import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { app, queryBridgeAccountType, apiSecurityMiddleware } from '../../../server';
import { setNoNewOrdersFlag } from '../../services/db';

/**
 * Stage D, batch 1: D5 (loopback), D6 (token never in the browser), D7 (no fake connection),
 * and the fail-safe account-type rule (an unreachable bridge must never be treated as DEMO).
 */

const TEST_TOKEN = 'unit-test-bridge-token-0123456789abcdef-xyz';
const BRIDGE_URL = 'http://127.0.0.1:8001';

const healthPayload = {
  status: 'ok',
  mt5_package_installed: true,
  terminal_running: true,
  mt5_initialized: true,
  broker_connected: true,
  algo_trading_enabled: true,
  server_name: 'Exness-MT5Trial9',
  account_type: 'DEMO',
  is_demo: true,
  login: 123456789,
  broker_utc_offset_hours: 0,
  allow_trading: false,
  kill_engaged: false,
  timestamp_utc: new Date().toISOString(),
};

const accountPayload = {
  login: 123456789,
  server: 'Exness-MT5Trial9',
  account_type: 'DEMO',
  is_demo: true,
  balance: 10000,
  equity: 10000,
  margin: 0,
  free_margin: 10000,
  leverage: 200,
  currency: 'USD',
  utc_offset_hours: 0,
  status: 'ok',
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Stage D batch 1: security and honesty fixes', () => {
  let server: Server;
  let base = '';
  const realFetch = globalThis.fetch;
  const bridgeCalls: { url: string; auth?: string }[] = [];
  const savedEnv = { url: process.env.BRIDGE_URL, token: process.env.BRIDGE_TOKEN };

  function mockBridge(handler: (url: string) => Response | Promise<Response>) {
    bridgeCalls.length = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url.startsWith(base)) return realFetch(input, init); // calls to our own test server
      const headers = (init?.headers || {}) as Record<string, string>;
      bridgeCalls.push({ url, auth: headers.Authorization || headers.authorization });
      return handler(url);
    }) as any;
  }

  function bridgeDown() {
    mockBridge(() => {
      throw new TypeError('fetch failed');
    });
  }

  beforeAll(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise((r) => server.close(r));
  });

  beforeEach(() => {
    process.env.BRIDGE_URL = BRIDGE_URL;
    process.env.BRIDGE_TOKEN = TEST_TOKEN;
    setNoNewOrdersFlag(false);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.BRIDGE_URL = savedEnv.url;
    process.env.BRIDGE_TOKEN = savedEnv.token;
    if (savedEnv.url === undefined) delete process.env.BRIDGE_URL;
    if (savedEnv.token === undefined) delete process.env.BRIDGE_TOKEN;
  });

  // ---------- D7: no fake "connected" state ----------
  it('a fresh server does not claim the broker is ONLINE and shows no fake login', async () => {
    const res = await realFetch(`${base}/api/health`);
    const body: any = await res.json();
    expect(body.brokerStatus).toBe('OFFLINE');

    const status: any = await (await realFetch(`${base}/api/broker/status`)).json();
    expect(status.isConnected).toBe(false);
    expect(JSON.stringify(status)).not.toContain('50192834');
  });

  // ---------- D6: token stays on the server ----------
  it('/api/bridge/test calls the bridge with the server token and never returns the token', async () => {
    mockBridge((url) => (url.endsWith('/health') ? json(healthPayload) : json(accountPayload)));

    const res = await realFetch(`${base}/api/bridge/test`);
    const text = await res.text();
    const body = JSON.parse(text);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.online).toBe(true);
    expect(body.accountType).toBe('DEMO');
    expect(body.account?.balance).toBeFalsy();

    // The bridge was called with the Bearer token...
    expect(bridgeCalls.length).toBeGreaterThan(0);
    expect(bridgeCalls.every((c) => c.auth === `Bearer ${TEST_TOKEN}`)).toBe(true);
    // ...but the token never appears in what the browser receives.
    expect(text).not.toContain(TEST_TOKEN);
    // The full login is masked.
    expect(text).not.toContain('123456789');
  });

  it('after a successful bridge test /api/health reports ONLINE; after a failure it goes back to OFFLINE', async () => {
    mockBridge((url) => (url.endsWith('/health') ? json(healthPayload) : json(accountPayload)));
    await realFetch(`${base}/api/bridge/test`);
    let health: any = await (await realFetch(`${base}/api/health`)).json();
    expect(health.brokerStatus).toBe('ONLINE');

    bridgeDown();
    const failed = await realFetch(`${base}/api/bridge/test`);
    expect(failed.status).toBeGreaterThanOrEqual(400);
    health = await (await realFetch(`${base}/api/health`)).json();
    expect(health.brokerStatus).toBe('OFFLINE');
  });

  it('bridge errors returned to the browser never contain the token', async () => {
    mockBridge(() => json({ detail: `Invalid token ${TEST_TOKEN}` }, 401));
    const res = await realFetch(`${base}/api/bridge/test`);
    const text = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.parse(text).ok).toBe(false);
    expect(text).not.toContain(TEST_TOKEN);
  });

  it('/api/bridge/tick returns the quote and rejects invalid symbols', async () => {
    mockBridge(() => json({ symbol: 'EURUSDm', bid: 1.0851, ask: 1.0853, time: 1700000000 }));
    const ok: any = await (await realFetch(`${base}/api/bridge/tick/EURUSD`)).json();
    expect(ok.ok).toBe(true);
    expect(ok.bid).toBe(1.0851);

    const bad = await realFetch(`${base}/api/bridge/tick/${encodeURIComponent('EUR USD;rm')}`);
    expect(bad.status).toBe(400);
  });

  it('/api/bridge/candles validates symbol and timeframe and passes real candles through', async () => {
    const badTf = await realFetch(`${base}/api/bridge/candles?symbol=EURUSD&timeframe=X9`);
    expect(badTf.status).toBe(400);
    const badSym = await realFetch(`${base}/api/bridge/candles?symbol=${encodeURIComponent('../etc')}&timeframe=H1`);
    expect(badSym.status).toBe(400);

    mockBridge((url) =>
      url.includes('/candles')
        ? json({
            symbol: 'EURUSD',
            broker_symbol: 'EURUSDm',
            timeframe: 'H1',
            count: 1,
            utc_offset_hours: 0,
            candles: [{ time: 1700000000, open: 1.08, high: 1.09, low: 1.07, close: 1.085, tick_volume: 10, spread: 5 }],
          })
        : json(healthPayload)
    );
    const good: any = await (await realFetch(`${base}/api/bridge/candles?symbol=EURUSD&timeframe=H1&count=1`)).json();
    expect(good.ok).toBe(true);
    expect(good.candles).toHaveLength(1);
    expect(good.serverName).toBe('Exness-MT5Trial9');
  });

  // ---------- Fail-safe account type ----------
  it('queryBridgeAccountType is UNKNOWN (never DEMO) when the bridge is unreachable or odd', async () => {
    bridgeDown();
    expect(await queryBridgeAccountType()).toBe('UNKNOWN');

    mockBridge(() => json({ detail: 'boom' }, 500));
    expect(await queryBridgeAccountType()).toBe('UNKNOWN');

    mockBridge(() => json({ account_type: 'SOMETHING_NEW' }));
    expect(await queryBridgeAccountType()).toBe('UNKNOWN');
  });

  it('queryBridgeAccountType maps DEMO, REAL and CONTEST exactly', async () => {
    mockBridge(() => json({ account_type: 'DEMO' }));
    expect(await queryBridgeAccountType()).toBe('DEMO');
    mockBridge(() => json({ account_type: 'REAL' }));
    expect(await queryBridgeAccountType()).toBe('REAL');
    mockBridge(() => json({ account_type: 'CONTEST' }));
    expect(await queryBridgeAccountType()).toBe('CONTEST');
  });

  it('the order route refuses to send an order when the account type cannot be verified', async () => {
    bridgeDown();
    const res = await realFetch(`${base}/api/broker/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId: 'test_bot',
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.1,
        price: 1.085,
        sl: 1.08,
        tp: 1.09,
        mode: 'DEMO',
      }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toContain('ACCOUNT_TYPE_UNVERIFIED');
  });

  // ---------- D5: loopback only ----------
  function runMiddleware(host: string, origin?: string) {
    let status = 200;
    let body: any = null;
    let passed = false;
    apiSecurityMiddleware(
      { headers: { host, ...(origin ? { origin } : {}) }, path: '/broker/status' },
      {
        status(code: number) {
          status = code;
          return this;
        },
        json(data: any) {
          body = data;
          return this;
        },
      },
      () => {
        passed = true;
      }
    );
    return { status, body, passed };
  }

  it('without AI_STUDIO_PREVIEW the API accepts only localhost and 127.0.0.1', () => {
    expect(runMiddleware('127.0.0.1:3000').passed).toBe(true);
    expect(runMiddleware('localhost:3000').passed).toBe(true);

    // 0.0.0.0 and cloud-preview hostnames are no longer accepted outside the preview
    const zero = runMiddleware('0.0.0.0:3000');
    expect(zero.status).toBe(403);
    expect(zero.body.error).toContain('FORBIDDEN_HOST');

    expect(runMiddleware('myapp.run.app').status).toBe(403);
    expect(runMiddleware('aistudio.google.com').status).toBe(403);
  });

  it('a foreign Origin is rejected even when the Host is localhost', () => {
    const r = runMiddleware('127.0.0.1:3000', 'https://evil.example.com');
    expect(r.status).toBe(403);
    expect(r.body.error).toContain('FORBIDDEN_ORIGIN');
  });
});
