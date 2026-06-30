import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { supabaseAuth } from '@/config/supabase';
import { beginZohoLogin, isZohoConfigured } from '@/config/zoho';
import { reportError } from '@/lib/sentry';

export const LoginPage = () => {
  const { user, adminUser, signInWithPassword, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [portalMode, setPortalMode] = useState<'business' | 'infra'>('business');

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    // If fully loaded and logged in as admin, redirect to app
    if (!initializing && user && adminUser) {
      // If the user was trying to go somewhere specific, send them there.
      // Otherwise, send them to the portal they selected during login.
      if (from === '/') {
        navigate(portalMode === 'infra' ? '/infra' : '/', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  }, [user, adminUser, initializing, navigate, from, portalMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithPassword(email, password);
      // Let the useEffect handle the redirect once adminUser is loaded
    } catch (err) {
      reportError(err, { where: 'LoginPage.handleSubmit' });
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleZohoSignIn = () => {
    setError(null);
    try {
      beginZohoLogin();
    } catch (err) {
      reportError(err, { where: 'LoginPage.handleZohoSignIn' });
      setError(err instanceof Error ? err.message : 'Unable to continue with Zoho');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabaseAuth.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err) {
      reportError(err, { where: 'LoginPage.handleResetPassword' });
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="PromptLine Admin" className="login-card__logo" />
        <h1>Admin Dashboard</h1>
        <p className="login-card__subtitle">Sign in with your PromptLine team account</p>

        {isForgotPassword ? (
          resetSent ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ fontWeight: 600, color: 'hsl(var(--success))', marginBottom: '1rem' }}>Recovery email sent!</p>
              <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Check your inbox for a link to reset your password.
              </p>
              <button className="btn btn--secondary" style={{ width: '100%' }} onClick={() => { setIsForgotPassword(false); setResetSent(false); }}>
                Back to Login
              </button>
            </div>
          ) : (
            <form className="login-card__form" onSubmit={handleResetPassword}>
              {error && <div className="login-card__error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="team@promptline.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" className="btn btn--ghost" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => setIsForgotPassword(false)}>
                Back to Login
              </button>
            </form>
          )
        ) : (
          <div className="login-card__form-wrapper">
            <div style={{ display: 'flex', background: 'hsl(var(--muted))', padding: '4px', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setPortalMode('business')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  background: portalMode === 'business' ? 'hsl(var(--card))' : 'transparent',
                  color: portalMode === 'business' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  boxShadow: portalMode === 'business' ? 'var(--elevation-1)' : 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Business
              </button>
              <button
                type="button"
                onClick={() => setPortalMode('infra')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  background: portalMode === 'infra' ? 'hsl(var(--card))' : 'transparent',
                  color: portalMode === 'infra' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  boxShadow: portalMode === 'infra' ? 'var(--elevation-1)' : 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Infrastructure
              </button>
            </div>

            <form className="login-card__form" onSubmit={handleSubmit}>
              {error && <div className="login-card__error">{error}</div>}

              {isZohoConfigured() && (
                <>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    onClick={handleZohoSignIn}
                    disabled={loading}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path fill="#2E9E47" d="M3 3h18v18H3z" />
                      <path fill="#FFF" d="M8 8h8v2l-6 6h6v2H8v-2l6-6H8z" />
                    </svg>
                    Continue with Zoho
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'hsl(var(--border))' }} />
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>OR</span>
                    <div style={{ flex: 1, height: '1px', background: 'hsl(var(--border))' }} />
                  </div>
                </>
              )}

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="team@promptline.com"
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIsForgotPassword(true)}>
                Forgot password?
              </button>
            </div>
          </form>
          </div>
        )}
      </div>
    </div>
  );
};
