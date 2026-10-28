/**
 * Portal <-> new bridge compatibility (round 5).
 * The bridge answers errors as {"detail": {"error": CODE, "message": TEXT}} and may send null offsets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  getDb: vi.fn(),
  logOrderIntent: vi.fn(),
  updateOrderStatus: vi.fn(),
  getOrderById: vi.fn(),
  consumeLiveToken: vi.fn(() => true),
  insertAuditLog: vi.fn(),
  insertRiskEvent: vi.fn(),
  savePositionDb: vi.fn(),
}));
vi.mock('../../services/db', () => db);
vi.mock('../../services/crypto', () => ({ hashContent: (s: string) => `h:${s}` }));

import {
  BridgeClient,
  BridgeError,
  executeOrderThroughBridge,
  isDefiniteNotSent,
  parseBridgeErrorBody,
} from '../../services/bridgeClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function client(fetchFn: any, extra: Record<string, unknown> = {}) {
  return new BridgeClient({ baseUrl: 'http://bridge.test', token: 'tok', fetchFn, initialRetryDelayMs: 1, ...extra });
}

const order: any = {
  id: 'ord_1', idempotencyKey: 'k', botId: 'bot1', magicNumber: 1001, symbol: 'EURUSD', side: 'BUY',
  volume: 0.1, intentPrice: 1.1, sl: 1.09, status: 'PENDING_BROKER', comment: 'zfx_1001_123456',
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getOrderById.mockImplementation((id: string) => ({ ...order, id }));
});

describe('parseBridgeErrorBody', () => {
  it('reads the FastAPI detail object', () => {
    expect(parseBridgeErrorBody({ detail: { error: 'ORDER_REJECTED', message: 'No money' } })).toEqual({
      code: 'ORDER_REJECTED',
      message: 'ORDER_REJECTED: No money',
    });
  });
  it('reads a string detail, an error string, and FastAPI validation arrays', () => {
    expect(parseBridgeErrorBody({ detail: 'plain' })).toEqual({ message: 'plain' });
    expect(parseBridgeErrorBody({ error: 'BAD' })).toEqual({ code: 'BAD', message: 'BAD' });
    expect(parseBridgeErrorBody({ detail: [{ msg: 'field required' }] }).message).toBe('field required');
  });
  it('tolerates junk', () => {
    expect(parseBridgeErrorBody(null)).toEqual({});
    expect(parseBridgeErrorBody('x')).toEqual({});
  });
});

describe('BridgeClient error handling against the new bridge', () => {
  it('never prints [object Object] and keeps the bridge code', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400, { detail: { error: 'INVALID_STOPS', message: 'too close' } }));
    const err: any = await client(fetchFn).sendOrder({ symbol: 'EURUSD', side: 'BUY', volume: 0.1, sl: 1.09 }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.message).not.toContain('[object Object]');
    expect(err.message).toContain('INVALID_STOPS');
    expect(err.bridgeCode).toBe('INVALID_STOPS');
  });

  it('does not retry a 404', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(404, { detail: { error: 'POSITION_NOT_FOUND', message: 'none' } }));
    const err: any = await client(fetchFn).closePosition(5).catch((e) => e);
    expect(err.code).toBe('BRIDGE_NOT_FOUND');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 MT5_DISCONNECTED on reads, then gives up with the bridge code', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(503, { detail: { error: 'MT5_DISCONNECTED', message: 'down' } }));
    const err: any = await client(fetchFn, { maxRetries: 2 }).getAccount().catch((e) => e);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(err.bridgeCode).toBe('MT5_DISCONNECTED');
  });

  it('accepts null offsets, UNKNOWN account type and trade_mode -1 in health and candles', async () => {
    const health = { status: 'ok', broker_connected: false, account_type: 'UNKNOWN', trade_mode: -1, broker_utc_offset_hours: null };
    const candles = { symbol: 'EURUSD', timeframe: 'H1', count: 0, utc_offset_hours: null, time_basis: 'broker', candles: [] };
    const f = vi.fn(async (url: any) => (String(url).includes('/health') ? jsonResponse(200, health) : jsonResponse(200, candles)));
    const c = client(f);
    expect((await c.getHealth()).broker_utc_offset_hours).toBeNull();
    expect((await c.getCandles('EURUSD', 'H1', 10)).utc_offset_hours).toBeNull();
  });

  it('retries /kill once on a 5xx', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { detail: { error: 'VERIFICATION_FAILED', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, allFlat: true, closed: [], unclosed: [], kill_state_engaged: true, timestamp: 't' }));
    const r = await client(f).tripKillSwitch();
    expect(r.allFlat).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('isDefiniteNotSent', () => {
  const mk = (status: number, code: any, bridgeCode?: string) => new BridgeError(status, code, 'm', undefined, bridgeCode);
  it.each([
    [mk(502, 'BRIDGE_ERROR', 'ORDER_REJECTED'), true],
    [mk(502, 'BRIDGE_ERROR', 'ORDER_CHECK_FAILED'), true],
    [mk(503, 'BRIDGE_ERROR', 'MT5_DISCONNECTED'), true],
    [mk(503, 'BRIDGE_ERROR', 'NO_TICK'), true],
    [mk(400, 'BRIDGE_BAD_REQUEST', 'INVALID_STOPS'), true],
    [mk(403, 'BRIDGE_FORBIDDEN', 'TRADING_DISABLED'), true],
    [mk(422, 'BRIDGE_BAD_REQUEST'), true],
    [mk(502, 'BRIDGE_ERROR', 'ORDER_OUTCOME_UNKNOWN'), false],
    [mk(408, 'BRIDGE_TIMEOUT'), false],
    [mk(503, 'BRIDGE_UNREACHABLE'), false],
    [mk(500, 'BRIDGE_ERROR'), false],
    [mk(502, 'BRIDGE_ERROR'), false],
  ])('%#', (err, expected) => {
    expect(isDefiniteNotSent(err)).toBe(expected);
  });
});

describe('executeOrderThroughBridge status mapping', () => {
  const run = (f: any) => executeOrderThroughBridge(client(f), order, { botMode: 'DEMO_LIVE' });
  const lastStatus = () => db.updateOrderStatus.mock.calls.at(-1)?.[1];

  it('a broker reject is REJECTED, not UNKNOWN', async () => {
    const r = await run(vi.fn(async () => jsonResponse(502, { detail: { error: 'ORDER_REJECTED', message: 'Market closed', retcode: 10018 } })));
    expect(r.success).toBe(false);
    expect(lastStatus()).toBe('REJECTED');
  });

  it('a disconnected terminal (nothing sent) is REJECTED', async () => {
    await run(vi.fn(async () => jsonResponse(503, { detail: { error: 'MT5_DISCONNECTED', message: 'down' } })));
    expect(lastStatus()).toBe('REJECTED');
  });

  it('ORDER_OUTCOME_UNKNOWN stays UNKNOWN for reconciliation', async () => {
    await run(vi.fn(async () => jsonResponse(502, { detail: { error: 'ORDER_OUTCOME_UNKNOWN', message: 'reconcile' } })));
    expect(lastStatus()).toBe('UNKNOWN');
  });

  it('a network failure stays UNKNOWN and is sent exactly once', async () => {
    const f = vi.fn(async () => { throw new Error('socket hang up'); });
    await run(f);
    expect(lastStatus()).toBe('UNKNOWN');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a partial fill records the bridge volume on the position', async () => {
    await run(vi.fn(async () => jsonResponse(200, { status: 'PARTIAL', message: 'p', ticket: 77, fill_price: 1.1, volume: 0.04, symbol: 'EURUSD', retcode: 10010 })));
    expect(db.savePositionDb).toHaveBeenCalledWith(expect.objectContaining({ ticket: 77, volume: 0.04 }));
  });
});
