import { describe, it, expect } from 'vitest';
import { formatUsd, getPlanOption, PLAN_OPTIONS } from './domain';

describe('formatUsd', () => {
  it('drops cents for whole-dollar amounts', () => {
    expect(formatUsd(9900)).toBe('$99');
    expect(formatUsd(29900)).toBe('$299');
    expect(formatUsd(0)).toBe('$0');
  });

  it('keeps two decimals for fractional amounts', () => {
    expect(formatUsd(33341)).toBe('$333.41');
    expect(formatUsd(150)).toBe('$1.50');
  });

  it('adds thousands separators', () => {
    expect(formatUsd(123456789)).toBe('$1,234,567.89');
  });
});

describe('getPlanOption', () => {
  it('resolves a known tier', () => {
    expect(getPlanOption('starter')?.label).toBe('Starter');
    expect(getPlanOption('pro')?.label).toBe('Pro');
  });

  it('returns null for unknown / missing tiers', () => {
    expect(getPlanOption('enterprise')).toBeNull();
    expect(getPlanOption(null)).toBeNull();
    expect(getPlanOption(undefined)).toBeNull();
  });
});

describe('PLAN_OPTIONS', () => {
  // Guards the plan-config alignment with the billing system's canonical values
  // (promptline-secure _shared/billing.ts): a drift here mis-prices plan switches.
  it('matches the canonical Starter plan', () => {
    const starter = getPlanOption('starter')!;
    expect(starter.amountCents).toBe(9900);
    expect(starter.monthlyCalls).toBe(100);
    expect(starter.junkCalls).toBe(100);
  });

  it('matches the canonical Pro plan', () => {
    const pro = getPlanOption('pro')!;
    expect(pro.amountCents).toBe(29900);
    expect(pro.monthlyCalls).toBe(500);
    expect(pro.junkCalls).toBe(300);
  });

  it('exposes exactly the two tiers', () => {
    expect(PLAN_OPTIONS.map((p) => p.tier)).toEqual(['starter', 'pro']);
  });
});
