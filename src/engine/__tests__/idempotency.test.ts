import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  db,
  tryAcquireIdempotencyKey,
  completeIdempotencyKey,
} from '../../db/sqlite';

describe('Atomic Idempotency Protocol & 409 Conflict Suite (Stage 1b)', () => {
  const userId = 'usr-idempotency-test';

  beforeEach(() => {
    db.prepare('DELETE FROM idempotency_keys WHERE user_id = ?').run(userId);
  });

  function computeHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  it('atomically acquires a new idempotency key with in_progress state', () => {
    const key = 'idem-key-new-' + Date.now();
    const hash = computeHash({ symbol: 'EURUSD', volume: 1.0, side: 'BUY' });

    const res = tryAcquireIdempotencyKey(key, userId, hash);
    expect(res.status).toBe('new');

    const row = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key) as any;
    expect(row.status).toBe('in_progress');
    expect(row.request_hash).toBe(hash);
  });

  it('rejects concurrent request with in_progress state when key is currently processing (explicit failing-case)', () => {
    const key = 'idem-key-inflight-' + Date.now();
    const hash = computeHash({ symbol: 'EURUSD', volume: 1.0, side: 'BUY' });

    // Initial request sets status to in_progress
    const firstAcq = tryAcquireIdempotencyKey(key, userId, hash);
    expect(firstAcq.status).toBe('new');

    // Concurrent incoming request with same key while first is processing
    const secondAcq = tryAcquireIdempotencyKey(key, userId, hash);
    expect(secondAcq.status).toBe('in_progress');
  });

  it('returns conflict status when idempotency key is reused with a different payload (explicit failing-case)', () => {
    const key = 'idem-key-mismatch-' + Date.now();
    const hash1 = computeHash({ symbol: 'EURUSD', volume: 1.0, side: 'BUY' });
    const hash2 = computeHash({ symbol: 'XAUUSD', volume: 2.5, side: 'SELL' }); // Different payload

    tryAcquireIdempotencyKey(key, userId, hash1);

    // Reuse key with different request payload
    const conflictRes = tryAcquireIdempotencyKey(key, userId, hash2);
    expect(conflictRes.status).toBe('conflict');
  });

  it('returns cached response immediately on exact replay of completed order', () => {
    const key = 'idem-key-completed-' + Date.now();
    const orderPayload = { symbol: 'GBPUSD', volume: 0.5, side: 'BUY' };
    const hash = computeHash(orderPayload);

    tryAcquireIdempotencyKey(key, userId, hash);

    const completionResponse = {
      success: true,
      order: { id: 'ord-filled-777', ticket: 12345678, status: 'FILLED' },
      message: 'Order filled successfully',
    };

    // Mark as completed
    completeIdempotencyKey(key, 200, completionResponse);

    // Exact replay returns cached response
    const replayRes = tryAcquireIdempotencyKey(key, userId, hash);
    expect(replayRes.status).toBe('completed');
    expect(replayRes.cachedStatus).toBe(200);
    expect(replayRes.cachedBody.order.ticket).toBe(12345678);
    expect(replayRes.cachedBody.success).toBe(true);
  });

  it('evicts expired idempotency keys past TTL and allows re-acquisition', () => {
    const key = 'idem-key-ttl-' + Date.now();
    const hash = computeHash({ symbol: 'USDJPY', volume: 1.0 });

    // Acquire with negative TTL (already expired)
    tryAcquireIdempotencyKey(key, userId, hash, -1000);

    // Re-acquisition detects expiration, cleans up, and treats as new
    const nextAcq = tryAcquireIdempotencyKey(key, userId, hash, 60000);
    expect(nextAcq.status).toBe('new');
  });
});
