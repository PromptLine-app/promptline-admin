import { FiServer, FiCpu, FiDatabase, FiShield, FiActivity } from 'react-icons/fi';

export const InfraDashboardPage = () => {
  return (
    <div className="page-content">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Infrastructure Dashboard
        </h1>
        <p className="text-muted">Monitor services, databases, and system health</p>
      </div>

      <div className="dashboard-kpi-row">
        <div className="page-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'hsl(142 71% 45% / 0.1)', display: 'grid', placeItems: 'center', color: 'hsl(var(--success))' }}>
            <FiServer size={22} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Services</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>—</p>
          </div>
        </div>

        <div className="page-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'hsl(212 100% 47% / 0.1)', display: 'grid', placeItems: 'center', color: 'hsl(var(--primary))' }}>
            <FiCpu size={22} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>CPU Usage</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>—</p>
          </div>
        </div>

        <div className="page-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'hsl(38 92% 50% / 0.1)', display: 'grid', placeItems: 'center', color: 'hsl(var(--warning))' }}>
            <FiDatabase size={22} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Database</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>—</p>
          </div>
        </div>

        <div className="page-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: 'hsl(0 84% 60% / 0.1)', display: 'grid', placeItems: 'center', color: 'hsl(var(--destructive))' }}>
            <FiShield size={22} />
          </div>
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Security Alerts</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>—</p>
          </div>
        </div>
      </div>

      <div className="dashboard-section" style={{ marginTop: '2rem' }}>
        <div className="page-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <FiActivity size={48} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>Infrastructure Monitoring Coming Soon</h3>
          <p className="text-muted" style={{ maxWidth: 480, margin: '0 auto' }}>
            This portal will display real-time service health, database metrics, security events, and system logs.
            The pages in the sidebar are placeholders that will be built out as we connect your monitoring data sources.
          </p>
        </div>
      </div>
    </div>
  );
};
