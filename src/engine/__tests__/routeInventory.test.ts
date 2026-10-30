import { describe, it, expect, beforeAll } from 'vitest';
import { createExpressApp, PUBLIC_ALLOWLIST_ROUTES, isPublicAllowlisted } from '../../../server';

describe('Route Inventory & Fail-Closed Allowlist Guard (Stage 1a)', () => {
  let app: any;
  let registeredRoutes: Array<{ method: string; path: string }> = [];

  beforeAll(async () => {
    app = await createExpressApp({ skipVite: true });

    // Introspect Express router stack (Express 5 uses app.router or app._router)
    const router = (app as any).router || (app as any)._router;
    const stack = router?.stack || [];
    for (const layer of stack) {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods || {});
        for (const m of methods) {
          registeredRoutes.push({ method: m.toUpperCase(), path });
        }
      }
    }
  });

  it('contains essential public allowlist routes', () => {
    expect(PUBLIC_ALLOWLIST_ROUTES.has('/api/health')).toBe(true);
    expect(PUBLIC_ALLOWLIST_ROUTES.has('/api/auth/config')).toBe(true);
    expect(PUBLIC_ALLOWLIST_ROUTES.has('/api/technical/analysis')).toBe(true);
    expect(PUBLIC_ALLOWLIST_ROUTES.has('/api/fundamentals/cot')).toBe(true);
    expect(PUBLIC_ALLOWLIST_ROUTES.has('/api/fundamentals/macro')).toBe(true);
  });

  it('accurately resolves public allowlist pattern matching', () => {
    expect(isPublicAllowlisted('/api/health')).toBe(true);
    expect(isPublicAllowlisted('/api/auth/config')).toBe(true);
    expect(isPublicAllowlisted('/api/smartmoney/latest')).toBe(true);
    expect(isPublicAllowlisted('/api/smartmoney/signals')).toBe(true);
    expect(isPublicAllowlisted('/api/fundamentals/calendar')).toBe(true);
    expect(isPublicAllowlisted('/api/technical/analysis')).toBe(true);

    // Protected routes must NOT be in public allowlist (explicit failing cases)
    expect(isPublicAllowlisted('/api/orders')).toBe(false);
    expect(isPublicAllowlisted('/api/admin/users')).toBe(false);
    expect(isPublicAllowlisted('/api/admin/firewall')).toBe(false);
    expect(isPublicAllowlisted('/api/admin/killswitch')).toBe(false);
    expect(isPublicAllowlisted('/api/strategies')).toBe(false);
    expect(isPublicAllowlisted('/api/backtests')).toBe(false);
    expect(isPublicAllowlisted('/api/ai/analyze-market')).toBe(false);
    expect(isPublicAllowlisted('/api/data/load')).toBe(false);
    expect(isPublicAllowlisted('/api/data/export')).toBe(false);
    expect(isPublicAllowlisted('/api/data/export-bundle')).toBe(false);
    expect(isPublicAllowlisted('/api/data/import-bundle')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/stats')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/dry-run-cleanup')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/apply-cleanup')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/patch-cot')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/backfill-cot')).toBe(false);
    expect(isPublicAllowlisted('/api/runbook/backtest-xau')).toBe(false);
    expect(isPublicAllowlisted('/api/xau-guide/backtest-xau')).toBe(false);
  });

  it('guarantees all registered API endpoints are accounted for in route inventory', () => {
    expect(registeredRoutes.length).toBeGreaterThanOrEqual(25);

    const sensitiveRoutes = registeredRoutes.filter(
      (r) =>
        r.path.startsWith('/api/admin') ||
        r.path.startsWith('/api/orders') ||
        r.path.startsWith('/api/strategies') ||
        r.path.startsWith('/api/backtests') ||
        r.path.startsWith('/api/ai') ||
        r.path.startsWith('/api/runbook') ||
        r.path.startsWith('/api/xau-guide')
    );

    // All sensitive routes must NOT be allowlisted
    for (const sr of sensitiveRoutes) {
      expect(isPublicAllowlisted(sr.path)).toBe(false);
    }
  });
});
