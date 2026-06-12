import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { supabaseAuth } from '@/config/supabase';
import { zohoRedirectUri } from '@/config/zoho';

/**
 * Handles the Zoho OAuth callback for admin login.
 *
 * 1. Zoho redirects here with ?code=...
 * 2. POST the code to /api/zoho/session, which verifies the Zoho identity
 *    server-side and returns a one-time Supabase token_hash.
 * 3. Redeem the token_hash via verifyOtp to establish the session immediately
 *    (no emailed magic link — identity is already proven by Zoho).
 * 4. AuthProvider's onAuthStateChange then loads the admin_users row; AdminGuard
 *    decides whether this identity is actually allowed into the dashboard.
 */
const ZohoCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [status, setStatus] = useState('Authenticating with Zoho…');
  const processedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    // Already signed in (e.g. a stray re-visit) — go home.
    if (session) {
      navigate('/', { replace: true });
      return;
    }

    if (errorParam) {
      setStatus(`Zoho authentication failed: ${errorParam}`);
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (!code) {
      setStatus('Invalid response from Zoho. Redirecting to login…');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    const authenticateWithZoho = async () => {
      try {
        setStatus('Completing sign-in…');

        // Verify the Zoho identity and mint a Supabase session server-side. The
        // endpoint does the code exchange + profile lookup itself (so the email
        // is server-verified, never asserted by the browser) and returns a
        // one-time token_hash we redeem below — no emailed link, no inbox detour.
        const sessionResponse = await fetch('/api/zoho/session', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: zohoRedirectUri() }),
        });

        const sessionData = await sessionResponse.json();
        if (!sessionResponse.ok || sessionData.error) {
          throw new Error(sessionData.error || 'Zoho sign-in failed');
        }

        // Redeem the one-time token for an actual session on this device.
        const { error: verifyError } = await supabaseAuth.auth.verifyOtp({
          type: 'magiclink',
          token_hash: sessionData.token_hash,
        });
        if (verifyError) {
          throw verifyError;
        }

        setStatus('Signed in! Redirecting…');
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Zoho auth error:', err);
        setStatus(
          err instanceof Error ? err.message : 'An error occurred during authentication',
        );
        setTimeout(() => navigate('/login'), 5000);
      }
    };

    void authenticateWithZoho();
  }, [searchParams, navigate, session]);

  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <svg viewBox="0 0 48 48" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#2E9E47" d="M6 6h36v36H6z" />
            <path fill="#FFF" d="M16 16h16v4l-12 12h12v4H16v-4l12-12H16z" />
          </svg>
        </div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{status}</h2>
        <p className="text-muted" style={{ fontSize: '0.875rem' }}>
          Please wait while we connect your Zoho account…
        </p>
      </div>
    </div>
  );
};

export default ZohoCallbackPage;
