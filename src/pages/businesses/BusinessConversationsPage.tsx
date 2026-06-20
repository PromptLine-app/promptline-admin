import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useToast } from '@/components/common/Toast';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { reportError } from '@/lib/sentry';

type Thread = {
  id: string;
  contact_id: string | null;
  ai_enabled: boolean | null;
  created_at: string;
};
type Contact = { id: string; first_name: string | null; last_name: string | null; phone: string | null };
type Message = {
  interaction_id: string;
  direction: string | null;
  message_type: string | null;
  body: string;
  sent_at: string | null;
  status: string | null;
};

const contactLabel = (c: Contact | undefined) => {
  if (!c) return 'Unknown contact';
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return name || c.phone || 'Unknown contact';
};

export const BusinessConversationsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const { data: threadRows } = await supabase
        .from('interactions')
        .select('id, contact_id, ai_enabled, created_at')
        .eq('tenant_id', id)
        .eq('channel', 'sms')
        .order('created_at', { ascending: false });

      const threadList = (threadRows || []) as Thread[];
      setThreads(threadList);

      const contactIds = [...new Set(threadList.map((t) => t.contact_id).filter(Boolean))] as string[];
      if (contactIds.length) {
        const { data: contactRows } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, phone')
          .in('id', contactIds);
        const map = new Map<string, Contact>();
        (contactRows || []).forEach((c: any) => map.set(c.id, c));
        setContacts(map);
      }

      const { data: msgRows } = await supabase
        .from('interaction_messages')
        .select('interaction_id, direction, message_type, body, sent_at, status')
        .eq('tenant_id', id)
        .eq('channel', 'sms')
        .order('sent_at', { ascending: true })
        .limit(2000);
      setMessages((msgRows || []) as Message[]);
    } catch (error) {
      reportError(error, { where: 'BusinessConversationsPage.fetchData' });
      console.error('Error loading conversations:', error);
      toast('Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Index messages by thread for previews + the open thread.
  const byThread = useMemo(() => {
    const map = new Map<string, Message[]>();
    messages.forEach((m) => {
      const arr = map.get(m.interaction_id) || [];
      arr.push(m);
      map.set(m.interaction_id, arr);
    });
    return map;
  }, [messages]);

  const selectedMessages = selected ? byThread.get(selected) || [] : [];

  return (
    <BusinessSubLayout tenantId={id!}>
      {loading ? (
        <div className="page-card">
          <p>Loading conversations…</p>
        </div>
      ) : threads.length === 0 ? (
        <div className="page-card">
          <div className="empty-state">
            <p className="empty-state__text">No SMS conversations for this business yet.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: '1rem' }}>
          {/* Thread list */}
          <div className="page-card" style={{ padding: 0, maxHeight: '70vh', overflowY: 'auto' }}>
            {threads.map((t) => {
              const msgs = byThread.get(t.id) || [];
              const last = msgs[msgs.length - 1];
              const c = t.contact_id ? contacts.get(t.contact_id) : undefined;
              const isActive = selected === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    border: 'none',
                    borderBottom: '1px solid hsl(var(--border))',
                    background: isActive ? 'hsl(var(--muted))' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600 }}>{contactLabel(c)}</span>
                    {!t.ai_enabled && (
                      <span style={{ fontSize: '0.65rem', color: 'hsl(var(--warning))' }}>AI off</span>
                    )}
                  </div>
                  <p
                    className="text-muted"
                    style={{
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: '0.2rem',
                    }}
                  >
                    {last ? `${last.direction === 'outbound' ? 'You: ' : ''}${last.body}` : 'No messages'}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>
                    {last?.sent_at ? new Date(last.sent_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) : ''} · {msgs.length} msg
                  </p>
                </button>
              );
            })}
          </div>

          {/* Message pane */}
          <div className="page-card" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {!selected ? (
              <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                <p className="empty-state__text">Select a conversation to read the thread.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {selectedMessages.map((m, i) => {
                  const outbound = m.direction === 'outbound' || m.message_type === 'ai' || m.message_type === 'agent';
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: outbound ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: outbound ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                        color: outbound ? 'hsl(var(--primary-foreground, 0 0% 100%))' : 'inherit',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '12px',
                      }}
                    >
                      <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</p>
                      <p
                        style={{
                          fontSize: '0.65rem',
                          opacity: 0.7,
                          marginTop: '0.25rem',
                          textAlign: outbound ? 'right' : 'left',
                        }}
                      >
                        {m.message_type === 'ai' ? 'AI · ' : ''}
                        {m.sent_at ? new Date(m.sent_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) : ''}
                        {m.status ? ` · ${m.status}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </BusinessSubLayout>
  );
};
