import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiArrowLeft, FiBarChart2, FiUsers, FiCheckCircle, FiXCircle, FiClock } from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingCampaign } from '@/types/domain';

export const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [stats, setStats] = useState({
    active: 0,
    completed: 0,
    suppressed: 0,
    stepDistribution: {} as Record<number, number>
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchAnalytics = async () => {
      try {
        const [campRes, enrollRes] = await Promise.all([
          supabase.from('marketing_campaigns').select('*').eq('id', id).single(),
          supabase.from('campaign_enrollments').select('status, current_step_number').eq('campaign_id', id)
        ]);

        if (campRes.error) throw campRes.error;
        if (enrollRes.error) throw enrollRes.error;

        setCampaign(campRes.data);

        // Process enrollments
        let active = 0, completed = 0, suppressed = 0;
        const stepDist: Record<number, number> = {};

        enrollRes.data?.forEach(e => {
          if (e.status === 'active') active++;
          else if (e.status === 'completed') completed++;
          else if (e.status === 'suppressed' || e.status === 'exited') suppressed++;

          if (e.status === 'active') {
            stepDist[e.current_step_number] = (stepDist[e.current_step_number] || 0) + 1;
          }
        });

        setStats({ active, completed, suppressed, stepDistribution: stepDist });
      } catch (err) {
        reportError(err, { where: 'CampaignDetailPage' });
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
      case 'sending':
        return 'hsl(var(--c2))';
      case 'completed':
      case 'sent':
        return 'hsl(var(--c4))';
      case 'paused':
        return 'hsl(var(--c3))';
      default:
        return 'hsl(var(--muted-foreground))';
    }
  };

  if (loading) {
    return (
      <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 40, width: 250, borderRadius: 8 }} />
        <div style={{ display: 'flex', gap: '1rem' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 120, flex: 1, borderRadius: 12 }} />)}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="page-content">
        <p>Campaign not found.</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Emails Sent', value: campaign.total_sent.toLocaleString(), icon: <FiBarChart2 />, color: 'hsl(var(--primary))' },
    { label: 'Active in Sequence', value: stats.active.toLocaleString(), icon: <FiClock />, color: 'hsl(var(--c2))' },
    { label: 'Completed', value: stats.completed.toLocaleString(), icon: <FiCheckCircle />, color: 'hsl(var(--c4))' },
    { label: 'Suppressed/Opt-out', value: stats.suppressed.toLocaleString(), icon: <FiXCircle />, color: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="page-content animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => navigate('/marketing/campaigns')}
            style={{ background: 'var(--secondary)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            className="btn btn--secondary"
          >
            <FiArrowLeft />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{campaign.name}</h1>
              <span style={{ 
                padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                background: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))'
              }}>
                {campaign.type.toUpperCase()}
              </span>
              <span style={{ 
                padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                background: `${getStatusColor(campaign.status)}20`, color: getStatusColor(campaign.status)
              }}>
                {campaign.status.toUpperCase()}
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>
              Created on {new Date(campaign.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ 
              width: 40, height: 40, borderRadius: 'var(--radius)', 
              background: `${kpi.color}15`, color: kpi.color, 
              display: 'grid', placeItems: 'center', fontSize: '1.2rem' 
            }}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{kpi.label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics Main Section */}
      {campaign.type === 'sequence' && (
        <div className="page-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Audience Progress (Active)</h3>
          {Object.keys(stats.stepDistribution).length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'hsl(var(--secondary))', borderRadius: 'var(--radius)' }}>
              <p className="text-muted">No active audience data to display for this sequence.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {Object.entries(stats.stepDistribution).map(([step, count]) => {
                const percentage = Math.round((count / stats.active) * 100) || 0;
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '80px', fontWeight: 600, fontSize: '0.875rem' }}>Step {step}</div>
                    <div style={{ flex: 1, height: '8px', background: 'hsl(var(--secondary))', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'hsl(var(--primary))', width: `${percentage}%`, transition: 'width 1s ease-in-out' }} />
                    </div>
                    <div style={{ width: '100px', textAlign: 'right', fontSize: '0.875rem' }}>
                      <span style={{ fontWeight: 600 }}>{count}</span> <span className="text-muted">({percentage}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
