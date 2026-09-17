import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { MarketingSender } from '@/types/domain';
import {
  FiMail, FiCheck, FiX, FiAlertCircle, FiRefreshCw, FiExternalLink,
} from 'react-icons/fi';

export const SendersPage = () => {
  const { toast } = useToast();
  const [senders, setSenders] = useState<MarketingSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');

  const loadSenders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_senders')
        .select('*')
        .eq('is_active', true)
        .order('display_name');
      if (error) throw error;
      setSenders((data ?? []) as MarketingSender[]);
    } catch (err) {
      reportError(err, { where: 'SendersPage.load' });
      toast('Failed to load senders', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSenders(); }, [loadSenders]);

  const handleConnectWithToken = async (senderId: string) => {
    if (!tokenInput.trim()) { toast('Please enter the Zoho refresh token', 'error'); return; }
    setSaving(senderId);
    try {
      const { error } = await supabase
        .from('marketing_senders')
        .update({
          refresh_token: tokenInput.trim(),
          is_connected: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', senderId);
      if (error) throw error;
      toast('Sender connected!', 'success');
      setShowTokenModal(null);
      setTokenInput('');
      await loadSenders();
    } catch (err) {
      reportError(err, { where: 'SendersPage.connect' });
      toast('Failed to connect sender', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleDisconnect = async (senderId: string) => {
    setSaving(senderId);
    try {
      const { error } = await supabase
        .from('marketing_senders')
        .update({
          refresh_token: null,
          zoho_account_id: null,
          is_connected: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', senderId);
      if (error) throw error;
      toast('Sender disconnected', 'success');
      await loadSenders();
    } catch (err) {
      reportError(err, { where: 'SendersPage.disconnect' });
      toast('Failed to disconnect sender', 'error');
    } finally {
      setSaving(null);
    }
  };

  const ZOHO_TOKEN_URL = 'https://api-console.zoho.com/';

  return (
    <div className="page-content">
      <PageHeader
        title="Sender Accounts"
        subtitle="Connect product owner email accounts to send marketing emails"
      />

      {/* How it works */}
      <div className="page-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'hsl(var(--primary) / 0.04)', border: '1px solid hsl(var(--primary) / 0.15)' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'hsl(var(--primary))' }}>
          How Sender Connection Works
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { step: '1', text: 'Go to Zoho API Console and create an OAuth token for the mailbox' },
            { step: '2', text: 'Generate a refresh token for the ZohoMail.messages.CREATE scope' },
            { step: '3', text: 'Paste the refresh token below — no passwords shared' },
            { step: '4', text: 'Emails will be sent from that Zoho mailbox via OAuth' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'hsl(var(--primary))',
                display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
              }}>
                {step}
              </div>
              <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>{text}</p>
            </div>
          ))}
        </div>
        <a
          href={ZOHO_TOKEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--secondary btn--sm"
          style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <FiExternalLink /> Open Zoho API Console
        </a>
      </div>

      {/* Sender cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="page-card skeleton" style={{ height: 180 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {senders.map(sender => (
            <div key={sender.id} className="page-card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: sender.is_connected ? 'hsl(142 71% 45% / 0.15)' : 'hsl(var(--muted))',
                  display: 'grid', placeItems: 'center',
                  fontSize: '1.25rem', fontWeight: 700,
                  color: sender.is_connected ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))',
                }}>
                  {sender.display_name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '0.15rem' }}>{sender.display_name}</h3>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>{sender.email}</p>
                </div>
                <span style={{
                  padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
                  background: sender.is_connected ? 'hsl(142 71% 45% / 0.1)' : 'hsl(38 92% 50% / 0.1)',
                  color: sender.is_connected ? 'hsl(142 71% 45%)' : 'hsl(38 92% 50%)',
                }}>
                  {sender.is_connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>

              {sender.is_connected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'hsl(142 71% 45%)' }}>
                    <FiCheck /> Zoho OAuth token active
                  </div>
                  <button
                    className="btn btn--secondary btn--sm"
                    style={{ color: 'hsl(var(--destructive))' }}
                    onClick={() => handleDisconnect(sender.id)}
                    disabled={saving === sender.id}
                  >
                    <FiX style={{ marginRight: '0.3rem' }} />
                    {saving === sender.id ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'hsl(38 92% 50%)', marginBottom: '0.75rem' }}>
                    <FiAlertCircle /> Not connected yet
                  </div>
                  <button
                    className="btn btn--primary btn--sm"
                    style={{ width: '100%' }}
                    onClick={() => { setShowTokenModal(sender.id); setTokenInput(''); }}
                  >
                    <FiMail style={{ marginRight: '0.3rem' }} /> Connect via Zoho Token
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Token input modal */}
      {showTokenModal && (
        <div className="modal-backdrop" onClick={() => setShowTokenModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Connect Sender Account</h3>
              <button className="icon-button" onClick={() => setShowTokenModal(null)}><FiX /></button>
            </div>

            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              Paste the <strong>Zoho OAuth Refresh Token</strong> for{' '}
              <strong>{senders.find(s => s.id === showTokenModal)?.email}</strong>.
              This token is generated from the Zoho API Console with the{' '}
              <code style={{ background: 'hsl(var(--secondary))', padding: '0.1rem 0.3rem', borderRadius: 4, fontSize: '0.8rem' }}>
                ZohoMail.messages.CREATE
              </code>{' '}
              scope. No password is stored.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Zoho Refresh Token *</label>
              <textarea
                className="form-input"
                style={{ fontFamily: 'monospace', fontSize: '0.75rem', height: 100, resize: 'none' }}
                placeholder="1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn--secondary" onClick={() => setShowTokenModal(null)}>Cancel</button>
              <button
                className="btn btn--primary"
                onClick={() => showTokenModal && handleConnectWithToken(showTokenModal)}
                disabled={!tokenInput.trim() || saving === showTokenModal}
              >
                <FiCheck style={{ marginRight: '0.3rem' }} />
                {saving === showTokenModal ? 'Connecting…' : 'Connect Sender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
