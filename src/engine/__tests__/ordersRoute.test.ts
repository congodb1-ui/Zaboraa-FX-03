import { describe, it, expect, beforeAll } from 'vitest';
import { createExpressApp } from '../../../server';
import { db, saveFirewallSetting, assignUserAccount } from '../../db/sqlite';

describe('POST /api/orders End-to-End Route Suite', () => {
  let app: any;
  const testUserId = 'test-orders-user-123';
  const testEmail = 'trader-orders@zaboraa.com';
  const testAccountId = '99887766';

  beforeAll(async () => {
    app = await createExpressApp({ skipVite: true });

    // Assign account to user in SQLite
    assignUserAccount(testUserId, testAccountId, 'admin@zaboraa.com');

    // Configure test account firewall limits
    saveFirewallSetting(testAccountId, 'maxRiskPerTradePct', '2.0', 'admin@zaboraa.com');
    saveFirewallSetting(testAccountId, 'maxLots', '2.0', 'admin@zaboraa.com');
    saveFirewallSetting(testAccountId, 'mandatoryStopLoss', 'true', 'admin@zaboraa.com');
  });

  // Helper function to dispatch mock requests to Express app
  async function dispatchOrder(body: any, headers: Record<string, string> = {}, user?: any) {
    const defaultUser = {
      userId: testUserId,
      email: testEmail,
      role: 'trader',
      permissions: ['order.place_demo', 'order.place_live'],
      aal: 'aal1',
    };

    return new Promise<{ status: number; body: any }>((resolve) => {
      const req: any = {
        method: 'POST',
        path: '/api/orders',
        url: '/api/orders',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body,
        user: user !== undefined ? user : defaultUser,
      };

      let statusCode = 200;
      const res: any = {
        setHeader: () => res,
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          resolve({ status: statusCode, body: data });
        },
      };

      // Find the /api/orders route handler in app stack
      const router = (app as any).router || (app as any)._router;
      const routeLayer = router.stack.find(
        (l: any) => l.route && l.route.path === '/api/orders' && l.route.methods.post
      );

      if (routeLayer) {
        routeLayer.route.stack[0].handle(req, res);
      } else {
        resolve({ status: 404, body: { error: 'ROUTE_NOT_FOUND' } });
      }
    });
  }

  it('rejects order missing Stop-Loss with 422 FIREWALL_REJECTED', async () => {
    const res = await dispatchOrder({
      accountId: testAccountId,
      accountType: 'demo',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.5,
      price: 1.0850,
      sl: 0, // Missing SL
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('FIREWALL_REJECTED');
    expect(res.body.rule).toBe('mandatoryStopLoss');

    // Confirm recorded in blocked_orders_log
    const log = db.prepare('SELECT * FROM blocked_orders_log WHERE account_id = ? AND rule_violated = ?').get(testAccountId, 'mandatoryStopLoss');
    expect(log).toBeDefined();
  });

  it('rejects order exceeding max lots with 422 and suggestedLots', async () => {
    const res = await dispatchOrder({
      accountId: testAccountId,
      accountType: 'demo',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 5.0, // Limit is 2.0
      price: 1.0850,
      sl: 1.0800,
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('FIREWALL_REJECTED');
    expect(res.body.rule).toBe('maxLots');
    expect(res.body.suggestedLots).toBe(2.0);
  });

  it('rejects excessive risk percentage with 422 and calculated safe suggestedLots', async () => {
    const res = await dispatchOrder({
      accountId: testAccountId,
      accountType: 'demo',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 1.0,
      price: 1.0850,
      sl: 1.0500, // 350 pips risk on 1 lot = $3500 risk (> 2% on $10k balance)
      balance: 10000,
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('FIREWALL_REJECTED');
    expect(res.body.rule).toBe('maxRiskPerTradePct');
    expect(res.body.suggestedLots).toBeDefined();
    expect(res.body.suggestedLots).toBeLessThan(1.0);
  });

  it('enforces object-level account authorization: 403 on unassigned account', async () => {
    const res = await dispatchOrder({
      accountId: 'unassigned-account-999',
      accountType: 'demo',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      price: 1.0850,
      sl: 1.0820,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ACCOUNT_ACCESS');
  });

  it('treats UNKNOWN accountType as LIVE and rejects when ALLOW_LIVE is unset', async () => {
    const oldEnv = process.env.ALLOW_LIVE;
    delete process.env.ALLOW_LIVE;

    const res = await dispatchOrder({
      accountId: testAccountId,
      accountType: 'UNKNOWN', // Must resolve to LIVE
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      price: 1.0850,
      sl: 1.0820,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('LIVE_TRADING_DISABLED');

    if (oldEnv) process.env.ALLOW_LIVE = oldEnv;
  });

  it('enforces idempotency conflict on payload mutation for same idempotency key', async () => {
    const key = 'idem-route-test-' + Date.now();

    // First request
    await dispatchOrder(
      { accountId: testAccountId, accountType: 'demo', symbol: 'EURUSD', side: 'BUY', volume: 0.1, price: 1.085, sl: 1.082 },
      { 'x-idempotency-key': key }
    );

    // Replay with different body (volume changed)
    const conflictRes = await dispatchOrder(
      { accountId: testAccountId, accountType: 'demo', symbol: 'EURUSD', side: 'BUY', volume: 0.2, price: 1.085, sl: 1.082 },
      { 'x-idempotency-key': key }
    );

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toBe('IDEMPOTENCY_CONFLICT');
  });
});
