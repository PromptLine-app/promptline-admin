import { useState } from 'react';
import { supabaseAuth } from '@/config/supabase';
import { useNavigate } from 'react-router-dom';
import { reportError } from '@/lib/sentry';
import { FiLock, FiCheck } from 'react-icons/fi';

export const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabaseAuth.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;
      
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      reportError(err, { where: 'ResetPasswordPage.handleReset' });
      setError((err instanceof Error ? err.message : '') || 'Failed to update password. Your reset link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="PromptLine Admin" className="login-card__logo" />
        <h1>Reset Password</h1>
        <p className="login-card__subtitle">Enter your new password below</p>

        {success ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <FiCheck size={48} color="hsl(var(--success))" style={{ marginBottom: '1rem' }} />
            <p style={{ fontWeight: 600, color: 'hsl(var(--success))' }}>Password updated successfully!</p>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Redirecting to dashboard...</p>
          </div>
        ) : (
          <form className="login-card__form" onSubmit={handleReset}>
            {error && <div className="login-card__error">{error}</div>}
            
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <small className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                Must be at least 6 characters.
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              <FiLock style={{ marginRight: '0.5rem' }} />
              {loading ? 'Updating...' : 'Update Password'}
            </button>

            <button 
              type="button" 
              className="btn btn--ghost" 
              style={{ width: '100%', marginTop: '0.25rem' }} 
              onClick={() => navigate('/login')}
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
