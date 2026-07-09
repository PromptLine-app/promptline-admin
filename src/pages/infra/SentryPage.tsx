import { PageHeader } from '@/components/common/PageHeader';
import { FiExternalLink } from 'react-icons/fi';

export const SentryPage = () => {
  return (
    <div className="page-content">
      <PageHeader
        title="Sentry Error Monitoring"
        subtitle="View and track application exceptions and performance issues"
      />

      <div className="page-card" style={{ maxWidth: '600px' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Sentry Dashboard</h3>
        <p className="text-muted" style={{ marginBottom: '1.5rem', lineHeight: 1.5 }}>
          PromptLine uses Sentry to track errors and monitor application performance. 
          Click the button below to view the issues dashboard. Use the provided credentials to log in if you are prompted.
        </p>

        <a 
          href="https://promptline-app-sandbox.sentry.io/issues/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn--primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}
        >
          Open Sentry <FiExternalLink />
        </a>

        <div style={{ padding: '1.25rem', background: 'hsl(var(--muted) / 0.5)', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}>
          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login Credentials</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, display: 'inline-block', width: '90px' }}>Login:</span> 
              <code style={{ background: 'hsl(var(--background))', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid hsl(var(--border))' }}>ranjit@promptline.app</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, display: 'inline-block', width: '90px' }}>Password:</span> 
              <code style={{ background: 'hsl(var(--background))', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid hsl(var(--border))' }}>CheckInTheLab1</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
