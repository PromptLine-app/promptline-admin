import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import { zohoRedirectUri, beginZohoMarketingAuth } from '@/config/zoho';
import type { MarketingSender } from '@/types/domain';
import {
  FiMail, FiCheck, FiX, FiAlertCircle, FiRefreshCw, FiExternalLink,
} from 'react-icons/fi';

export const SendersPage = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [senders, setSenders] = useState<MarketingSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const processedRef = useRef(false);

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

  const handleConnectWithCode = useCallback(async (senderId: string, authCode: string) => {
    setSaving(senderId);
    try {
      const res = await fetch('/api/zoho/marketing-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode, redirect_uri: zohoRedirectUri() })
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to exchange authorization code. Please try again.');
      }
      
      const { error } = await supabase
        .from('marketing_senders')
        .update({
          refresh_token: data.refresh_token,
          is_connected: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', senderId);
      if (error) throw error;
      
      toast('Sender connected successfully!', 'success');
      await loadSenders();
    } catch (err) {
      reportError(err, { where: 'SendersPage.connect' });
      toast(err instanceof Error ? err.message : 'Failed to connect sender', 'error');
    } finally {
      setSaving(null);
      // Clean up URL
      navigate('/marketing/senders', { replace: true });
    }
  }, [loadSenders, navigate, toast]);

  useEffect(() => { loadSenders(); }, [loadSenders]);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      toast(`Zoho connection failed: ${errorParam}`, 'error');
      navigate('/marketing/senders', { replace: true });
      return;
    }

    if (code && state && state.startsWith('marketing:') && !processedRef.current) {
      processedRef.current = true;
      const senderId = state.replace('marketing:', '');
      void handleConnectWithCode(senderId, code);
    }
  }, [searchParams, handleConnectWithCode, navigate, toast]);

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
            { step: '1', text: 'Click "Connect Zoho" on the mailbox you want to authorize' },
            { step: '2', text: 'Sign in to the specific Zoho Mail account (e.g., ranjit@promptline.app)' },
            { step: '3', text: 'Approve the requested scopes to allow sending emails' },
            { step: '4', text: 'You will be redirected back, and the account will be connected!' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'hsl(var(--primary))',
                display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
              }}>
                {step}
              </div>
              <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.4, wordBreak: 'break-word' }}>{text}</p>
            </div>
          ))}
        </div>
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
                    onClick={() => beginZohoMarketingAuth(sender.id)}
                    disabled={saving === sender.id}
                  >
                    <FiMail style={{ marginRight: '0.3rem' }} /> {saving === sender.id ? 'Connecting...' : 'Connect Zoho'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
