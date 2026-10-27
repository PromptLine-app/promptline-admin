import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import {
  FiSearch, FiFilter, FiMail, FiCheckCircle, FiXCircle, FiClock,
  FiCalendar, FiUser, FiChevronLeft, FiChevronRight, FiRefreshCw,
  FiX, FiList, FiAlertCircle, FiCheck, FiSliders
} from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { EmailContact, MarketingSender } from '@/types/domain';

type TimelineEvent = {
  id: string;
  kind: 'enrolled' | 'email_sent' | 'email_failed' | 'opened' | 'clicked' | 'suppressed' | 'completed';
  label: string;
  detail?: string;
  timestamp: string;
};

type CampaignSendHistoryProps = {
  campaignId: string;
  campaignName: string;
  campaignType: 'sequence' | 'broadcast';
  enrolledContactIds: string[];
  senders?: MarketingSender[];
};

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const fmtShortDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const CampaignSendHistory: React.FC<CampaignSendHistoryProps> = ({
  campaignId,
  campaignName,
  campaignType,
  enrolledContactIds,
  senders = [],
}) => {
  // Senders list state (fallback if not passed)
  const [activeSenders, setActiveSenders] = useState<MarketingSender[]>(senders);

  // Table Data & Pagination State
  const [sends, setSends] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed' | 'sending'>('all');
  const [engagementFilter, setEngagementFilter] = useState<'all' | 'opened' | 'clicked' | 'unopened'>('all');
  const [senderFilter, setSenderFilter] = useState('all');

  // Date Filter States
  // Supports: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'single' | 'range'
  const [dateMode, setDateMode] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'single' | 'range'>('all');
  const [singleDate, setSingleDate] = useState<string>(''); // YYYY-MM-DD
  const [startDate, setStartDate] = useState<string>('');   // YYYY-MM-DD
  const [endDate, setEndDate] = useState<string>('');       // YYYY-MM-DD

  // Timeline Drawer State
  const [timelineContact, setTimelineContact] = useState<EmailContact | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [contactEnrollments, setContactEnrollments] = useState<any[]>([]);

  // Fetch senders if not supplied
  useEffect(() => {
    if (senders && senders.length > 0) {
      setActiveSenders(senders);
      return;
    }
    const loadSenders = async () => {
      try {
        const { data } = await supabase.from('marketing_senders').select('*').eq('is_active', true);
        if (data) setActiveSenders(data);
      } catch (err) {
        console.warn('Unable to load senders for filter', err);
      }
    };
    loadSenders();
  }, [senders]);

  // Main Data Fetcher
  const fetchSends = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_sends')
        .select(`
          id,
          recipient_email,
          subject,
          status,
          sent_at,
          opened_at,
          clicked_at,
          error_message,
          sender_id,
          contact_id,
          is_cold_sequence,
          marketing_senders(display_name, email),
          email_contacts(id, full_name, first_name, last_name, company, email, phone, tags, engagement_state)
        `, { count: 'exact' });

      // 1. Scoping to this Sequence/Campaign:
      // Try by campaign_id or fallback to enrolled contact IDs
      if (enrolledContactIds && enrolledContactIds.length > 0) {
        if (enrolledContactIds.length <= 100) {
          query = query.or(`campaign_id.eq.${campaignId},contact_id.in.(${enrolledContactIds.join(',')})`);
        } else {
          // If many contacts enrolled, prioritize campaign_id
          query = query.eq('campaign_id', campaignId);
        }
      } else {
        query = query.eq('campaign_id', campaignId);
      }

      // 2. Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // 3. Engagement / Tracking Filter
      if (engagementFilter === 'opened') {
        query = query.not('opened_at', 'is', null);
      } else if (engagementFilter === 'clicked') {
        query = query.not('clicked_at', 'is', null);
      } else if (engagementFilter === 'unopened') {
        query = query.is('opened_at', null).eq('status', 'sent');
      }

      // 4. Sender Filter
      if (senderFilter !== 'all') {
        query = query.eq('sender_id', senderFilter);
      }

      // 5. Date Filter (with Single Date & Date Range support)
      if (dateMode === 'today') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
        query = query.gte('sent_at', start).lte('sent_at', end);
      } else if (dateMode === 'yesterday') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString();
        query = query.gte('sent_at', start).lte('sent_at', end);
      } else if (dateMode === '7d') {
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('sent_at', start);
      } else if (dateMode === '30d') {
        const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('sent_at', start);
      } else if (dateMode === 'single' && singleDate) {
        // Specific Single Date requested by user
        const [y, m, d] = singleDate.split('-').map(Number);
        if (y && m && d) {
          const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
          const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
          query = query.gte('sent_at', start).lte('sent_at', end);
        }
      } else if (dateMode === 'range') {
        if (startDate) {
          const [sy, sm, sd] = startDate.split('-').map(Number);
          if (sy && sm && sd) {
            query = query.gte('sent_at', new Date(sy, sm - 1, sd, 0, 0, 0, 0).toISOString());
          }
        }
        if (endDate) {
          const [ey, em, ed] = endDate.split('-').map(Number);
          if (ey && em && ed) {
            query = query.lte('sent_at', new Date(ey, em - 1, ed, 23, 59, 59, 999).toISOString());
          }
        }
      }

      // 6. Text Search (Recipient or Subject)
      if (search.trim()) {
        const clean = search.trim();
        query = query.or(`recipient_email.ilike.%${clean}%,subject.ilike.%${clean}%`);
      }

      // 7. Order & Pagination
      query = query.order('sent_at', { ascending: false });
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      let { data, count, error } = await query;

      // Graceful fallback if campaign_id column does not exist yet
      if (error && (error.message?.includes('campaign_id') || error.code === 'PGRST204')) {
        if (enrolledContactIds && enrolledContactIds.length > 0) {
          let fallbackQuery = supabase
            .from('email_sends')
            .select(`
              id,
              recipient_email,
              subject,
              status,
              sent_at,
              opened_at,
              clicked_at,
              error_message,
              sender_id,
              contact_id,
              is_cold_sequence,
              marketing_senders(display_name, email),
              email_contacts(id, full_name, first_name, last_name, company, email, phone, tags, engagement_state)
            `, { count: 'exact' })
            .in('contact_id', enrolledContactIds.slice(0, 100))
            .order('sent_at', { ascending: false })
            .range(from, to);

          if (statusFilter !== 'all') fallbackQuery = fallbackQuery.eq('status', statusFilter);
          if (senderFilter !== 'all') fallbackQuery = fallbackQuery.eq('sender_id', senderFilter);
          if (search.trim()) {
            fallbackQuery = fallbackQuery.or(`recipient_email.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
          }

          const fallbackRes = await fallbackQuery;
          data = fallbackRes.data;
          count = fallbackRes.count;
          error = fallbackRes.error;
        }
      }

      if (error) throw error;

      setSends(data || []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      reportError(err, { where: 'CampaignSendHistory.fetchSends' });
      console.error('Failed to load campaign sends:', err);
    } finally {
      setLoading(false);
    }
  }, [
    campaignId,
    enrolledContactIds,
    page,
    pageSize,
    search,
    statusFilter,
    engagementFilter,
    senderFilter,
    dateMode,
    singleDate,
    startDate,
    endDate,
  ]);

  // Trigger query on parameter changes
  useEffect(() => {
    fetchSends();
  }, [fetchSends]);

  // Open Lead Activity Timeline Drawer
  const openLeadTimeline = async (contactId: string | null, recipientEmail: string, fallbackContact?: any) => {
    setTimelineLoading(true);
    setTimelineEvents([]);
    setContactEnrollments([]);

    try {
      let resolvedContact: EmailContact | null = fallbackContact ?? null;

      // 1. Resolve contact details
      if (!resolvedContact && contactId) {
        const { data: c } = await supabase.from('email_contacts').select('*').eq('id', contactId).maybeSingle();
        if (c) resolvedContact = c as EmailContact;
      }
      if (!resolvedContact && recipientEmail) {
        const { data: c } = await supabase.from('email_contacts').select('*').eq('email', recipientEmail).maybeSingle();
        if (c) resolvedContact = c as EmailContact;
      }

      if (!resolvedContact) {
        // Construct temporary contact view from email send
        resolvedContact = {
          id: contactId || 'unknown',
          email: recipientEmail,
          full_name: recipientEmail.split('@')[0],
          company: null,
          phone: null,
          tags: [],
          status: 'active',
          engagement_state: 'warm',
          lead_source: 'manual',
          source_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity_at: null,
          last_emailed_at: null,
          industry: null,
          notes: null,
          monthly_loss: null,
        };
      }

      setTimelineContact(resolvedContact);

      const events: TimelineEvent[] = [];

      // 2. Fetch Enrollments for this contact
      if (resolvedContact.id && resolvedContact.id !== 'unknown') {
        const { data: enrollments } = await supabase
          .from('campaign_enrollments')
          .select('id, current_step_number, status, next_run_at, enrolled_at, marketing_campaigns(name)')
          .eq('contact_id', resolvedContact.id)
          .order('enrolled_at', { ascending: true });

        if (enrollments) {
          setContactEnrollments(enrollments);
          for (const enr of enrollments as any[]) {
            const campName = (enr.marketing_campaigns as any)?.name ?? 'Unknown Sequence';
            events.push({
              id: `enr-enrolled-${enr.id}`,
              kind: 'enrolled',
              label: `Enrolled in "${campName}"`,
              detail: `Currently on Step ${enr.current_step_number}`,
              timestamp: enr.enrolled_at || new Date().toISOString(),
            });
            if (enr.status === 'suppressed' || enr.status === 'exited') {
              events.push({
                id: `enr-suppressed-${enr.id}`,
                kind: 'suppressed',
                label: `Exited "${campName}"`,
                detail: 'Suppressed / Replied / Exited sequence',
                timestamp: enr.next_run_at ?? enr.enrolled_at ?? new Date().toISOString(),
              });
            }
            if (enr.status === 'completed') {
              events.push({
                id: `enr-completed-${enr.id}`,
                kind: 'completed',
                label: `Completed all steps in "${campName}"`,
                timestamp: enr.next_run_at ?? enr.enrolled_at ?? new Date().toISOString(),
              });
            }
          }
        }
      }

      // 3. Fetch all email sends for this contact/email
      let sendsQuery = supabase
        .from('email_sends')
        .select('id, subject, status, sent_at, created_at, opened_at, clicked_at, error_message, is_cold_sequence, marketing_senders(display_name)')
        .order('sent_at', { ascending: true });

      if (resolvedContact.id && resolvedContact.id !== 'unknown') {
        sendsQuery = sendsQuery.or(`contact_id.eq.${resolvedContact.id},recipient_email.eq.${recipientEmail}`);
      } else {
        sendsQuery = sendsQuery.eq('recipient_email', recipientEmail);
      }

      const { data: sendsData } = await sendsQuery;

      if (sendsData) {
        for (const s of sendsData as any[]) {
          const senderName = s.marketing_senders?.display_name || 'PromptLine';
          events.push({
            id: `send-${s.id}`,
            kind: s.status === 'sent' ? 'email_sent' : 'email_failed',
            label: s.status === 'sent' ? `Email sent via ${senderName}` : `Email failed to send`,
            detail: s.error_message ? `Error: ${s.error_message}` : `Subject: "${s.subject}"`,
            timestamp: s.sent_at || s.created_at,
          });

          if (s.opened_at) {
            events.push({
              id: `open-${s.id}`,
              kind: 'opened',
              label: `Email opened by lead`,
              detail: `Subject: "${s.subject}"`,
              timestamp: s.opened_at,
            });
          }

          if (s.clicked_at) {
            events.push({
              id: `click-${s.id}`,
              kind: 'clicked',
              label: `Link clicked by lead`,
              detail: `Subject: "${s.subject}"`,
              timestamp: s.clicked_at,
            });
          }
        }
      }

      // Sort all events chronologically (newest first for timeline clarity)
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTimelineEvents(events);
    } catch (err: any) {
      reportError(err, { where: 'CampaignSendHistory.openLeadTimeline' });
      console.error('Failed to open lead timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Reset all filters helper
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setEngagementFilter('all');
    setSenderFilter('all');
    setDateMode('all');
    setSingleDate('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const isAnyFilterActive = search || statusFilter !== 'all' || engagementFilter !== 'all' || senderFilter !== 'all' || dateMode !== 'all';
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="page-card" style={{ padding: '1.5rem', marginTop: '1.5rem', background: 'hsl(var(--card))' }}>
      {/* Header & Meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Sends & Tracking History
            </h3>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.15rem 0.55rem',
              borderRadius: 999,
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
            }}>
              {totalCount.toLocaleString()} {totalCount === 1 ? 'Email' : 'Emails'}
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            Showing verified deliveries, open/click activity, and errors for <strong>{campaignName}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => fetchSends()}
            disabled={loading}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Refresh history"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} size={13} /> Refresh
          </button>
          {isAnyFilterActive && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleResetFilters}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'hsl(var(--destructive))' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        background: 'hsl(var(--secondary) / 0.5)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem'
      }}>
        {/* Row 1: Search & Quick Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }} />
            <input
              type="text"
              placeholder="Search by recipient email or subject..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                fontSize: '0.85rem',
                borderRadius: 6,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
              }}
            />
          </div>

          {/* Date Mode Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiCalendar size={14} className="text-muted" />
            <select
              value={dateMode}
              onChange={(e) => {
                setDateMode(e.target.value as any);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.65rem',
                fontSize: '0.825rem',
                borderRadius: 6,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                fontWeight: 500,
              }}
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="single">📅 Specific Single Date</option>
              <option value="range">📆 Custom Date Range</option>
            </select>
          </div>

          {/* Delivery Status Filter */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'hsl(var(--background))', padding: '0.2rem', borderRadius: 6, border: '1px solid hsl(var(--border))' }}>
            {(['all', 'sent', 'failed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: statusFilter === st ? 'hsl(var(--primary))' : 'transparent',
                  color: statusFilter === st ? '#fff' : 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Engagement Filter */}
          <select
            value={engagementFilter}
            onChange={(e) => {
              setEngagementFilter(e.target.value as any);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.65rem',
              fontSize: '0.825rem',
              borderRadius: 6,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Engagement</option>
            <option value="opened">🟢 Opened</option>
            <option value="clicked">🟣 Clicked Link</option>
            <option value="unopened">⚪ Not Opened</option>
          </select>

          {/* Sender Filter */}
          <select
            value={senderFilter}
            onChange={(e) => {
              setSenderFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.65rem',
              fontSize: '0.825rem',
              borderRadius: 6,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Senders / Mailboxes</option>
            {activeSenders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name || s.email}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Date Picker Controls (Single Date OR Date Range) */}
        {dateMode === 'single' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'hsl(var(--background))',
            borderRadius: 6,
            border: '1px solid hsl(var(--primary) / 0.3)',
            animation: 'fadeIn 0.2s ease',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FiCalendar /> Pick Specific Date:
            </span>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => {
                setSingleDate(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.825rem',
                borderRadius: 4,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                fontWeight: 600,
              }}
            />
            {singleDate ? (
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Showing emails sent on <strong>{fmtShortDate(singleDate)}</strong>
              </span>
            ) : (
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Select any date above to inspect that day&apos;s deliveries
              </span>
            )}
            {singleDate && (
              <button
                type="button"
                onClick={() => setSingleDate('')}
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
              >
                Clear date
              </button>
            )}
          </div>
        )}

        {dateMode === 'range' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'hsl(var(--background))',
            borderRadius: 6,
            border: '1px solid hsl(var(--border))',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.825rem',
                borderRadius: 4,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
              }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.825rem',
                borderRadius: 4,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
              }}
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}
              >
                Clear range
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sends Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'hsl(var(--secondary) / 0.6)', borderBottom: '1px solid hsl(var(--border))', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Lead / Recipient</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject & Sender</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Sent Date</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Delivery Status</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Engagement</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
                  <FiRefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 0.5rem' }} />
                  Loading sequence email history...
                </td>
              </tr>
            ) : sends.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
                  <div style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                    <FiMail size={32} style={{ opacity: 0.5 }} />
                  </div>
                  <h4 style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>No emails found</h4>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                    {isAnyFilterActive
                      ? 'No sends match your active filters. Try clearing your search or date selection.'
                      : 'No emails have been dispatched for this sequence yet.'}
                  </p>
                  {isAnyFilterActive && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={handleResetFilters}
                      style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}
                    >
                      Clear All Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              sends.map((s) => {
                const isFailed = s.status === 'failed';
                const isSending = s.status === 'sending';
                const isSent = s.status === 'sent' || (!s.status && !isFailed);
                const contact = s.email_contacts;
                const leadName = contact?.first_name && contact?.last_name
                  ? `${contact.first_name} ${contact.last_name}`
                  : contact?.full_name || s.recipient_email.split('@')[0];
                const companyName = contact?.company || null;
                const senderDisplay = s.marketing_senders?.display_name || 'PromptLine';

                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid hsl(var(--border))',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Lead Recipient — Clickable to open Timeline Drawer */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <button
                        type="button"
                        onClick={() => openLeadTimeline(s.contact_id, s.recipient_email, contact)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.15rem',
                          color: 'inherit',
                        }}
                        title="Click to view total contact timeline and sequence history"
                      >
                        <span style={{
                          fontWeight: 600,
                          color: 'hsl(var(--primary))',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}>
                          <FiUser size={13} /> {leadName}
                        </span>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {s.recipient_email}
                        </span>
                        {companyName && (
                          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--foreground))', opacity: 0.85 }}>
                            🏢 {companyName}
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Subject & Sender Mailbox */}
                    <td style={{ padding: '0.85rem 1rem', maxWidth: 360 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem', wordBreak: 'break-word' }}>
                        {s.subject || '(No Subject)'}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        via <strong>{senderDisplay}</strong>
                        {s.marketing_senders?.email && ` <${s.marketing_senders.email}>`}
                      </div>
                      {isFailed && s.error_message && (
                        <div style={{
                          fontSize: '0.72rem',
                          color: 'hsl(0 84% 60%)',
                          marginTop: '0.35rem',
                          background: 'hsl(0 84% 60% / 0.1)',
                          padding: '0.25rem 0.45rem',
                          borderRadius: 4,
                        }}>
                          Error: {s.error_message}
                        </div>
                      )}
                    </td>

                    {/* Sent Date */}
                    <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500 }}>
                        {formatDate(s.sent_at)}
                      </div>
                    </td>

                    {/* Status Pill */}
                    <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                      {isFailed && (
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'hsl(0 84% 60%)',
                          background: 'hsl(0 84% 60% / 0.12)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}>
                          <FiXCircle size={12} /> Failed
                        </span>
                      )}
                      {isSending && (
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'hsl(38 92% 50%)',
                          background: 'hsl(38 92% 50% / 0.12)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}>
                          <FiClock size={12} /> Sending
                        </span>
                      )}
                      {isSent && (
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'hsl(142 71% 45%)',
                          background: 'hsl(142 71% 45% / 0.12)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}>
                          <FiCheckCircle size={12} /> Sent
                        </span>
                      )}
                    </td>

                    {/* Engagement Tracking Badges */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                        {s.opened_at ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(142 71% 45%)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(142 71% 45%)' }}></span>
                            Opened ({fmtShortDate(s.opened_at)})
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--muted-foreground))' }}></span>
                            Not Opened
                          </span>
                        )}

                        {s.clicked_at ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(260 80% 60%)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(260 80% 60%)' }}></span>
                            Clicked Link
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.85rem'
        }}>
          <div className="text-muted">
            Showing <strong>{(page - 1) * pageSize + 1}</strong>–<strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> emails
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.5rem' }}>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8rem',
                  borderRadius: 4,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn--secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <FiChevronLeft /> Prev
            </button>

            <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0 0.4rem' }}>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              className="btn btn--secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Next <FiChevronRight />
            </button>
          </div>
        </div>
      )}

      {/* Slide-out Lead Activity Timeline Drawer */}
      {timelineContact && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 440,
            maxWidth: '92vw',
            background: 'hsl(var(--card))',
            borderLeft: '1px solid hsl(var(--border))',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
          }}
        >
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to   { transform: translateX(0);    opacity: 1; }
            }
            .tl-event { display: flex; gap: 0.75rem; position: relative; padding-bottom: 1.4rem; }
            .tl-event:not(:last-child)::before {
              content: '';
              position: absolute;
              left: 11px;
              top: 24px;
              bottom: 0;
              width: 2px;
              background: hsl(var(--border));
            }
            .tl-dot {
              flex-shrink: 0;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-top: 2px;
            }
          `}</style>

          {/* Drawer Header */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: '1px solid hsl(var(--border))',
            gap: '1rem',
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {timelineContact.first_name && timelineContact.last_name
                  ? `${timelineContact.first_name} ${timelineContact.last_name}`
                  : timelineContact.full_name || 'Contact'}
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'hsl(var(--primary))', fontWeight: 500 }}>
                {timelineContact.email}
              </p>
              {timelineContact.company && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', fontWeight: 600 }}>
                  🏢 {timelineContact.company}
                </p>
              )}
              {Array.isArray(timelineContact.tags) && timelineContact.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {timelineContact.tags.map(t => (
                    <span key={t} style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 4,
                      background: 'hsl(var(--secondary))',
                      color: 'hsl(var(--foreground))',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setTimelineContact(null)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, cursor: 'pointer' }}
            >
              <FiX size={16} />
            </button>
          </div>

          {/* Active Sequences Summary */}
          {contactEnrollments.length > 0 && (
            <div style={{
              margin: '0.75rem 1.25rem 0',
              padding: '0.75rem',
              background: 'hsl(var(--secondary) / 0.5)',
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
                <FiList size={11} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                Sequence Enrollments ({contactEnrollments.length})
              </p>
              {contactEnrollments.map((enr, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(enr.marketing_campaigns as any)?.name ?? 'Sequence'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 4, fontWeight: 600,
                      background: enr.status === 'active' ? 'hsl(217 91% 60% / 0.15)' : enr.status === 'completed' ? 'hsl(142 71% 45% / 0.12)' : 'hsl(var(--destructive) / 0.1)',
                      color: enr.status === 'active' ? 'hsl(217 91% 60%)' : enr.status === 'completed' ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))',
                    }}>
                      {enr.status === 'active' ? `Step ${enr.current_step_number}` : enr.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Activity Timeline List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
              <FiClock size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
              Total Prospect Timeline
            </p>

            {timelineLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
                <FiRefreshCw className="animate-spin" size={16} style={{ margin: '0 auto 0.5rem' }} />
                Loading prospect history...
              </div>
            ) : timelineEvents.length === 0 ? (
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No recorded email or sequence events for this lead.
              </p>
            ) : (
              <div>
                {timelineEvents.map((ev) => {
                  const dotColor =
                    ev.kind === 'enrolled'      ? 'hsl(217 91% 60%)' :
                    ev.kind === 'email_sent'    ? 'hsl(142 71% 45%)' :
                    ev.kind === 'opened'        ? 'hsl(142 71% 45%)' :
                    ev.kind === 'clicked'       ? 'hsl(260 80% 60%)' :
                    ev.kind === 'email_failed'  ? 'hsl(0 84% 60%)' :
                    ev.kind === 'completed'     ? 'hsl(142 71% 45%)' :
                    'hsl(var(--muted-foreground))';
                  const dotBg =
                    ev.kind === 'enrolled'      ? 'hsl(217 91% 60% / 0.12)' :
                    ev.kind === 'email_sent'    ? 'hsl(142 71% 45% / 0.12)' :
                    ev.kind === 'opened'        ? 'hsl(142 71% 45% / 0.15)' :
                    ev.kind === 'clicked'       ? 'hsl(260 80% 60% / 0.15)' :
                    ev.kind === 'email_failed'  ? 'hsl(0 84% 60% / 0.12)' :
                    ev.kind === 'completed'     ? 'hsl(142 71% 45% / 0.12)' :
                    'hsl(var(--secondary))';
                  const DotIcon =
                    ev.kind === 'enrolled'      ? FiList :
                    ev.kind === 'email_sent'    ? FiMail :
                    ev.kind === 'opened'        ? FiCheckCircle :
                    ev.kind === 'clicked'       ? FiSliders :
                    ev.kind === 'email_failed'  ? FiAlertCircle :
                    ev.kind === 'completed'     ? FiCheck :
                    FiX;

                  return (
                    <div key={ev.id} className="tl-event">
                      <div className="tl-dot" style={{ background: dotBg }}>
                        <DotIcon size={12} color={dotColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.825rem', fontWeight: 600, lineHeight: 1.3 }}>
                          {ev.label}
                        </p>
                        {ev.detail && (
                          <p style={{
                            margin: '0.2rem 0 0',
                            fontSize: '0.74rem',
                            color: 'hsl(var(--muted-foreground))',
                            wordBreak: 'break-word',
                          }}>
                            {ev.detail}
                          </p>
                        )}
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))' }}>
                          {formatDate(ev.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop for timeline drawer */}
      {timelineContact && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setTimelineContact(null)}
        />
      )}
    </div>
  );
};
