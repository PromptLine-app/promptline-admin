import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiSend, FiFileText, FiPlus, FiMoreVertical } from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingCampaign } from '@/types/domain';

export const CampaignsPage = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert({ name: newCampaignName, type: 'broadcast', status: 'draft' })
        .select()
        .single();
      
      if (error) throw error;
      if (data) navigate(`/marketing/campaigns/${data.id}`);
    } catch (err) {
      reportError(err, { where: 'CampaignsPage.create' });
      alert('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('marketing_campaigns')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCampaigns(data || []);
      } catch (err) {
        reportError(err, { where: 'CampaignsPage' });
      } finally {
        setLoading(false);
      }
    };
    fetchCampaigns();
  }, []);

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

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Campaigns</h1>
          <p className="text-muted">Manage your email broadcasts and multi-step sequences</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn--secondary" onClick={() => navigate('/marketing/sequences')}>
            <FiFileText style={{ marginRight: '0.5rem' }} /> Manage Sequences
          </button>
          <button className="btn btn--primary" onClick={() => setIsModalOpen(true)}>
            <FiPlus style={{ marginRight: '0.5rem' }} /> New Campaign
          </button>
        </div>
      </div>

      <div className="page-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 60, borderRadius: 8 }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%', background: 'hsl(var(--primary) / 0.1)',
                display: 'grid', placeItems: 'center', margin: '0 auto 1rem', color: 'hsl(var(--primary))', fontSize: '1.5rem'
              }}
            >
              <FiSend />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No campaigns yet</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>
              Create your first email broadcast or automated sequence to start engaging your audience.
            </p>
            <button className="btn btn--primary" onClick={() => setIsModalOpen(true)}>
              <FiPlus style={{ marginRight: '0.5rem' }} /> Create Campaign
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Created At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(camp => (
                <tr key={camp.id} onClick={() => navigate(`/marketing/campaigns/${camp.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{camp.name}</td>
                  <td>
                    <span style={{ 
                      padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                      background: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))'
                    }}>
                      {camp.type.charAt(0).toUpperCase() + camp.type.slice(1)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: getStatusColor(camp.status) }} />
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{camp.status}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{camp.total_sent.toLocaleString()}</td>
                  <td className="text-muted">{new Date(camp.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn--secondary" style={{ padding: '0.4rem' }}>
                      <FiMoreVertical />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Campaign Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="page-card" style={{ width: 400, padding: '1.5rem', background: 'hsl(var(--background))' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Create New Campaign</h2>
            <form onSubmit={handleCreateCampaign}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Campaign Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g., Q3 Customer Outreach" 
                  value={newCampaignName}
                  onChange={e => setNewCampaignName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={creating || !newCampaignName.trim()}>
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
