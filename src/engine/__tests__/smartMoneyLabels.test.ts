import { describe, it, expect } from 'vitest';
import { TICK_VOLUME_LABEL, COT_LABEL, DISCLAIMER_TEXT, SMART_MONEY_NAME } from '../smartMoney/cotConfig';

describe('Hard Rules Exact Labels Verification', () => {
  it('enforces exact required string for Tick Volume proxy', () => {
    // Hard Rule 4: Every place that shows it carries the exact text
    expect(TICK_VOLUME_LABEL).toBe('TICK VOLUME: activity proxy, not traded volume');
  });

  it('enforces exact required string for COT positioning', () => {
    // Hard Rule 5: The exact text is COT: reported futures positioning, weekly, as of Tuesday
    expect(COT_LABEL).toBe('COT: reported futures positioning, weekly, as of Tuesday');
  });

  it('enforces exact feature branding without forbidden buzzwords', () => {
    expect(SMART_MONEY_NAME).toBe('Smart Money Footprint');
    // Scope decision: Never "whale", "institutional flow", "buyers %" or "sellers %"
    expect(SMART_MONEY_NAME.toLowerCase()).not.toContain('whale');
    expect(SMART_MONEY_NAME.toLowerCase()).not.toContain('buyers %');
    expect(SMART_MONEY_NAME.toLowerCase()).not.toContain('sellers %');
  });

  it('includes mandatory disclaimer string', () => {
    expect(DISCLAIMER_TEXT).toContain('Research and advisory tool, not financial advice');
    expect(DISCLAIMER_TEXT).toContain('A signal is not an order');
  });
});
