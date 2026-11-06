import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { FiExternalLink, FiCopy, FiCheck, FiBarChart2 } from 'react-icons/fi';

export const GoogleAnalyticsPage = () => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Google Analytics"
        subtitle="Monitor website traffic, visitor demographics, and user engagement for promptline.app"
      />

      <div className="page-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--primary))',
            fontSize: '1.25rem',
          }}>
            <FiBarChart2 />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Google Analytics 4 (GA4)</h3>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Promptline Marketing Website</span>
          </div>
        </div>

        <p className="text-muted" style={{ marginBottom: '1.5rem', lineHeight: 1.5 }}>
          PromptLine uses Google Analytics to track visitors to <strong>promptline.app</strong>, analyze traffic acquisition sources, session duration, and user behavior. Click the button below to view live reports and visitor metrics.
        </p>

        <a 
          href="https://analytics.google.com/analytics/web/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn--primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}
        >
          Open Google Analytics <FiExternalLink />
        </a>

        {/* Credentials box */}
        <div style={{ padding: '1.25rem', background: 'hsl(var(--muted) / 0.5)', borderRadius: '8px', border: '1px solid hsl(var(--border))', marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login Credentials</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, display: 'inline-block', width: '90px' }}>Login:</span> 
                <code style={{ background: 'hsl(var(--background))', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid hsl(var(--border))' }}>noreply@promptline.app</code>
              </div>
              <button 
                type="button" 
                className="btn btn--ghost btn--sm" 
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                onClick={() => handleCopy('noreply@promptline.app', 'login')}
              >
                {copiedField === 'login' ? <><FiCheck color="hsl(var(--success))" /> Copied</> : <><FiCopy /> Copy</>}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, display: 'inline-block', width: '90px' }}>Password:</span> 
                <code style={{ background: 'hsl(var(--background))', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid hsl(var(--border))' }}>CheckInTheLab1</code>
              </div>
              <button 
                type="button" 
                className="btn btn--ghost btn--sm" 
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                onClick={() => handleCopy('CheckInTheLab1', 'password')}
              >
                {copiedField === 'password' ? <><FiCheck color="hsl(var(--success))" /> Copied</> : <><FiCopy /> Copy</>}
              </button>
            </div>
          </div>
        </div>

        {/* Stream Details box */}
        <div style={{ padding: '1.25rem', background: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}>
          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stream Information</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div>
              <span className="text-muted" style={{ display: 'block' }}>Target Website:</span>
              <a href="https://promptline.app" target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'hsl(var(--primary))' }}>
                promptline.app
              </a>
            </div>
            <div>
              <span className="text-muted" style={{ display: 'block' }}>Measurement ID:</span>
              <code style={{ fontWeight: 600 }}>G-QC5T423V41</code>
            </div>
            <div>
              <span className="text-muted" style={{ display: 'block' }}>Stream ID:</span>
              <code>16279944223</code>
            </div>
            <div>
              <span className="text-muted" style={{ display: 'block' }}>Enhanced Measurement:</span>
              <span style={{ color: 'hsl(var(--success))', fontWeight: 600 }}>Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

