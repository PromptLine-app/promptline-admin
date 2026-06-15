import { describe, it, expect } from 'vitest';
// The pure pipeline logic lives in the serverless _lib so the endpoint and these
// tests share one source of truth. Vitest only needs the test file itself under
// src/; importing JS from ../../api is fine.
import {
  buildLeadList,
  nextFollowupOnSend,
  normalizeStatus,
  summarizeLeads,
  classifyTenantStage,
  resolveTenantEmail,
  aggregateCallStats,
  buildTenantEntries,
  leadToEntry,
  summarizeStages,
} from '../../api/_lib/leadsCore.js';
import { renderTemplate, templateChoices } from '../../api/_lib/leadEmailTemplates.js';

const users = [
  { id: 'u1', email: 'a@x.com', full_name: 'Ann Lee', created_at: '2026-06-01T00:00:00Z' },
  { id: 'u2', email: 'b@x.com', full_name: 'Bo Tan', created_at: '2026-06-10T00:00:00Z' },
  { id: 'u3', email: 'c@x.com', full_name: 'Cy Roe', created_at: '2026-06-05T00:00:00Z' },
];

describe('buildLeadList', () => {
  it('excludes users who own any tenant (incl. soft-deleted)', () => {
    const owners = [{ owner_user_id: 'u2' }, { owner_user_id: null }];
    const leads = buildLeadList({ users, owners, followups: [] });
    expect(leads.map((l) => l.user_id)).toEqual(['u3', 'u1']); // u2 excluded, newest-first
  });

  it('defaults a user with no follow-up row to stage "new" / 0 attempts', () => {
    const leads = buildLeadList({ users: [users[0]], owners: [], followups: [] });
    expect(leads[0]).toMatchObject({ user_id: 'u1', status: 'new', attempts: 0, notes: '' });
  });

  it('merges existing follow-up state', () => {
    const followups = [
      { user_id: 'u1', status: 'contacted', attempts: 2, notes: 'left vm', last_template: 'how_can_i_help', last_contacted_at: '2026-06-12T00:00:00Z' },
    ];
    const leads = buildLeadList({ users: [users[0]], owners: [], followups });
    expect(leads[0]).toMatchObject({ status: 'contacted', attempts: 2, notes: 'left vm' });
  });

  it('sorts newest signup first', () => {
    const leads = buildLeadList({ users, owners: [], followups: [] });
    expect(leads.map((l) => l.user_id)).toEqual(['u2', 'u3', 'u1']);
  });
});

describe('nextFollowupOnSend', () => {
  it('first touch -> attempts 1, status contacted', () => {
    const next = nextFollowupOnSend(null, { templateKey: 'setup_help', nowIso: 'T' });
    expect(next).toEqual({ status: 'contacted', attempts: 1, last_template: 'setup_help', last_contacted_at: 'T' });
  });

  it('increments attempts on repeat sends', () => {
    const next = nextFollowupOnSend({ status: 'contacted', attempts: 3 }, { templateKey: 'x', nowIso: 'T' });
    expect(next.attempts).toBe(4);
    expect(next.status).toBe('contacted');
  });

  it('does not regress engaged/converted back to contacted', () => {
    expect(nextFollowupOnSend({ status: 'engaged', attempts: 1 }, { templateKey: 'x', nowIso: 'T' }).status).toBe('engaged');
    expect(nextFollowupOnSend({ status: 'converted', attempts: 1 }, { templateKey: 'x', nowIso: 'T' }).status).toBe('converted');
  });
});

describe('normalizeStatus', () => {
  it('accepts valid statuses', () => {
    expect(normalizeStatus('engaged')).toBe('engaged');
  });
  it('rejects invalid statuses', () => {
    expect(normalizeStatus('hacked')).toBeNull();
    expect(normalizeStatus(undefined)).toBeNull();
  });
});

describe('summarizeLeads', () => {
  it('counts by status', () => {
    const leads = [{ status: 'new' }, { status: 'new' }, { status: 'converted' }];
    expect(summarizeLeads(leads)).toEqual({ total: 3, new: 2, contacted: 0, engaged: 0, converted: 1, dismissed: 0 });
  });
});

describe('classifyTenantStage', () => {
  const T0 = Date.parse('2026-06-15T00:00:00Z');
  const opts = { stalledDays: 2, atRiskDays: 14, nowMs: T0 };
  const daysAgo = (n: number) => new Date(T0 - n * 86_400_000).toISOString();

  it('churned when billing canceled or soft-deleted', () => {
    expect(classifyTenantStage({ billing_status: 'canceled', onboarded: true }, opts)).toBe('churned');
    expect(classifyTenantStage({ is_deleted: true, onboarded: false }, opts)).toBe('churned');
  });

  it('stalled when not onboarded past the threshold', () => {
    expect(classifyTenantStage({ onboarded: false, created_at: daysAgo(3) }, opts)).toBe('stalled');
  });

  it('not a drop-off when not onboarded but still within the grace window', () => {
    expect(classifyTenantStage({ onboarded: false, created_at: daysAgo(1) }, opts)).toBeNull();
  });

  it('no_twilio when onboarded with no phone number', () => {
    expect(classifyTenantStage({ onboarded: true, twillio_phone: null }, opts)).toBe('no_twilio');
  });

  it('no_calls when onboarded, has a number, but zero calls', () => {
    expect(
      classifyTenantStage({ onboarded: true, twillio_phone: '+1555', call_count: 0 }, opts),
    ).toBe('no_calls');
  });

  it('at_risk when previously active but quiet past the threshold', () => {
    expect(
      classifyTenantStage(
        { onboarded: true, twillio_phone: '+1555', call_count: 5, last_call_at: daysAgo(20) },
        opts,
      ),
    ).toBe('at_risk');
  });

  it('active (null) when calls are recent', () => {
    expect(
      classifyTenantStage(
        { onboarded: true, twillio_phone: '+1555', call_count: 5, last_call_at: daysAgo(3) },
        opts,
      ),
    ).toBeNull();
  });

  it('priority: churned beats stalled', () => {
    expect(
      classifyTenantStage({ billing_status: 'canceled', onboarded: false, created_at: daysAgo(10) }, opts),
    ).toBe('churned');
  });
});

describe('resolveTenantEmail', () => {
  it('prefers owner account email, falls back to billing', () => {
    expect(resolveTenantEmail({}, { email: 'owner@x.com' }, { billing_email: 'bill@x.com' })).toBe('owner@x.com');
    expect(resolveTenantEmail({}, null, { billing_email: 'bill@x.com' })).toBe('bill@x.com');
    expect(resolveTenantEmail({}, null, null)).toBeNull();
  });
});

describe('aggregateCallStats', () => {
  it('counts calls and tracks the latest per tenant', () => {
    const stats = aggregateCallStats([
      { tenant_id: 't1', created_at: '2026-06-01T00:00:00Z' },
      { tenant_id: 't1', created_at: '2026-06-10T00:00:00Z' },
      { tenant_id: 't2', created_at: '2026-06-05T00:00:00Z' },
    ]);
    expect(stats.get('t1')).toEqual({ call_count: 2, last_call_at: '2026-06-10T00:00:00Z' });
    expect(stats.get('t2')).toEqual({ call_count: 1, last_call_at: '2026-06-05T00:00:00Z' });
  });
});

describe('buildTenantEntries', () => {
  const T0 = Date.parse('2026-06-15T00:00:00Z');
  const daysAgo = (n: number) => new Date(T0 - n * 86_400_000).toISOString();

  it('emits entries only for dropped-off businesses, with owner email + merged followup', () => {
    const tenants = [
      { id: 't1', company_name: 'Acme', owner_user_id: 'u1', onboarded: false, created_at: daysAgo(5) },
      { id: 't2', company_name: 'Healthy Co', owner_user_id: 'u2', onboarded: true, twillio_phone: '+1', created_at: daysAgo(30) },
    ];
    const usersById = new Map([
      ['u1', { email: 'a@x.com', full_name: 'Ann' }],
      ['u2', { email: 'b@x.com', full_name: 'Bo' }],
    ]);
    const callStatsByTenant = new Map([['t2', { call_count: 3, last_call_at: daysAgo(1) }]]);
    const followupsByTenant = new Map([['t1', { status: 'contacted', attempts: 1, notes: 'called' }]]);

    const entries = buildTenantEntries({
      tenants,
      usersById,
      callStatsByTenant,
      followupsByTenant,
      thresholds: { stalledDays: 2, atRiskDays: 14 },
      nowMs: T0,
    });

    expect(entries).toHaveLength(1); // t2 is healthy (recent calls) → excluded
    expect(entries[0]).toMatchObject({
      subject_type: 'tenant',
      subject_id: 't1',
      stage: 'stalled',
      name: 'Acme',
      email: 'a@x.com',
      status: 'contacted',
      attempts: 1,
      notes: 'called',
    });
  });
});

describe('leadToEntry + summarizeStages', () => {
  it('maps a lead to a unified entry', () => {
    const entry = leadToEntry({
      user_id: 'u1', email: 'a@x.com', full_name: 'Ann', created_at: 'T', status: 'new', attempts: 0, notes: '', last_template: null, last_contacted_at: null,
    });
    expect(entry).toMatchObject({ subject_type: 'lead', subject_id: 'u1', stage: 'lead', name: 'Ann', email: 'a@x.com' });
  });

  it('counts entries by stage', () => {
    const s = summarizeStages([{ stage: 'lead' }, { stage: 'lead' }, { stage: 'churned' }, { stage: 'at_risk' }]);
    expect(s).toEqual({ total: 4, lead: 2, stalled: 0, no_twilio: 0, no_calls: 0, at_risk: 1, churned: 1 });
  });
});

describe('email templates', () => {
  it('renders a known template with the first name merged in', () => {
    const out = renderTemplate('how_can_i_help', { fullName: 'Ann Lee' });
    expect(out?.subject).toContain('How can');
    expect(out?.body).toContain('Hi Ann,');
  });

  it('falls back to "there" when name is missing', () => {
    expect(renderTemplate('setup_help', {})?.body).toContain('Hi there,');
  });

  it('returns null for an unknown template', () => {
    expect(renderTemplate('nope', { fullName: 'X' })).toBeNull();
  });

  it('exposes template choices for the dropdown', () => {
    const choices = templateChoices();
    expect(choices.length).toBeGreaterThan(0);
    expect(choices[0]).toHaveProperty('key');
    expect(choices[0]).toHaveProperty('label');
  });
});
