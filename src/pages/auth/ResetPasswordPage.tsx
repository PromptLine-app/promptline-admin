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
    } catch (err: any) {
      reportError(err, { where: 'ResetPasswordPage.handleReset' });
      setError(err.message || 'Failed to update password. Your reset link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '400px' }}>
        <div className="login-header">
          <div className="login-logo">
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 10C27.9086 10 10 27.9086 10 50C10 61.0457 14.4772 71.0457 21.7157 78.2843C28.9543 85.5228 38.9543 90 50 90C72.0914 90 90 72.0914 90 50C90 27.9086 72.0914 10 50 10Z" fill="url(#paint0_linear)"/>
              <path d="M30 50L45 65L75 35" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="paint0_linear" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#0066FF"/>
                  <stop offset="1" stopColor="#00E5FF"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2>Reset Password</h2>
          <p className="text-muted">Enter your new password below.</p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <FiCheck size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
            <p style={{ fontWeight: 600 }}>Password updated successfully!</p>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Redirecting to dashboard...</p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleReset}>
            {error && <div className="login-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
              />
            </div>
            <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              <FiLock style={{ marginRight: '0.5rem' }} />
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
