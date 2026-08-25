import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCustomerAppUrl } from './customerAppUrl';

describe('getCustomerAppUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CUSTOMER_APP_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses VITE_CUSTOMER_APP_URL when set', () => {
    vi.stubEnv('VITE_CUSTOMER_APP_URL', 'https://secure.sandbox.promptline.app/');
    expect(getCustomerAppUrl()).toBe('https://secure.sandbox.promptline.app');
  });

  it('derives secure host from sandbox admin host', () => {
    expect(getCustomerAppUrl('admin.sandbox.promptline.app')).toBe(
      'https://secure.sandbox.promptline.app',
    );
  });

  it('derives secure host from production admin host', () => {
    expect(getCustomerAppUrl('admin.promptline.app')).toBe('https://secure.promptline.app');
  });

  it('falls back to production secure URL', () => {
    expect(getCustomerAppUrl()).toBe('https://secure.promptline.app');
  });
});
