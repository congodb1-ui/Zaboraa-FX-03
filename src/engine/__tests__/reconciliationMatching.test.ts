/** Reconciliation must not invent fills and must say when it could not read the broker. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  getPendingOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  getOpenPositionsDb: vi.fn(),
  getPositionByTicketDb: vi.fn(),
  savePositionDb: vi.fn(),
  closePositionDb: vi.fn(),
  getBotByMagic: vi.fn(),
  insertAuditLog: vi.fn(),
  insertRiskEvent: vi.fn(),
}));
vi.mock('../../services/db', () => db);

import { reconcileWithBroker } from '../reconciliation';

const pending = (over: Record<string, unknown> = {}): any => ({
  id: 'o1', magicNumber: 1001, symbol: 'EURUSD', side: 'BUY', comment: 'zfx_1001_123456',
  createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), ...over,
});
const pos = (over: Record<string, unknown> = {}): any => ({
  ticket: 7, time: 1, type: 0, magic: 1001, volume: 0.1, price_open: 1.1, sl: 1.09, tp: 0, price_current: 1.1,
  swap: 0, profit: 0, symbol: 'EURUSD', comment: 'x', ...over,
});
const deal = (over: Record<string, unknown> = {}): any => ({
  ticket: 5, order: 999, time: 1, type: 0, entry: 0, magic: 1001, position_id: 5, volume: 0.1, price: 1.1,
  commission: 0, swap: 0, profit: 0, symbol: 'EURUSD', comment: 'other', ...over,
});
const client = (positions: any, deals: any = []): any => ({
  getPositions: typeof positions === 'function' ? positions : async () => positions,
  getDeals: async () => deals,
  closePosition: async () => ({}),
});
const statusOf = () => db.updateOrderStatus.mock.calls.map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  db.getPendingOrders.mockReturnValue([pending()]);
  db.getOpenPositionsDb.mockReturnValue([]);
  db.getPositionByTicketDb.mockReturnValue(undefined);
  db.getBotByMagic.mockReturnValue(null);
});

describe('reconcileWithBroker', () => {
  it('reports complete=false when broker positions cannot be read', async () => {
    const r = await reconcileWithBroker(client(async () => { throw new Error('503'); }));
    expect(r.complete).toBe(false);
    expect(db.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('reports complete=true on a normal run', async () => {
    expect((await reconcileWithBroker(client([]))).complete).toBe(true);
  });

  it('an old deal from the same bot and symbol does NOT fill a never-sent order', async () => {
    await reconcileWithBroker(client([], [deal()]));
    expect(statusOf()).toEqual(['FAILED']);
  });

  it('a deal carrying the order comment does fill it', async () => {
    await reconcileWithBroker(client([], [deal({ comment: 'zfx_1001_123456' })]));
    expect(statusOf()).toEqual(['FILLED']);
  });

  it('a position the database already tracks is not claimed by a different pending order', async () => {
    db.getPositionByTicketDb.mockImplementation((t: number) => (t === 7 ? { ticket: 7 } : undefined));
    await reconcileWithBroker(client([pos()]));
    expect(statusOf()).toEqual(['FAILED']);
  });

  it('an untracked position with the order comment fills it', async () => {
    await reconcileWithBroker(client([pos({ comment: 'zfx_1001_123456' })]));
    expect(statusOf()).toEqual(['FILLED']);
  });

  it('a position on the opposite side is not matched by magic and symbol alone', async () => {
    await reconcileWithBroker(client([pos({ type: 1 })]));
    expect(statusOf()).toEqual(['FAILED']);
  });
});
