import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiFileText, FiPlus, FiMoreVertical } from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingCampaign } from '@/types/domain';

export const SequencesPage = () => {
  const navigate = useNavigate();
  const [sequences, setSequences] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchSequences = async () => {
      try {
        const { data, error } = await supabase
          .from('marketing_campaigns')
          .select('*')
          .eq('type', 'sequence')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSequences(data || []);
      } catch (err) {
        reportError(err, { where: 'SequencesPage' });
      } finally {
        setLoading(false);
      }
    };
    fetchSequences();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeqName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert({ name: newSeqName, type: 'sequence', status: 'draft' })
        .select()
        .single();
      
      if (error) throw error;
      if (data) navigate(`/marketing/campaigns/${data.id}`);
    } catch (err) {
      reportError(err, { where: 'SequencesPage.create' });
      alert('Failed to create sequence');
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'hsl(var(--c2))';
      case 'completed':
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Sequences</h1>
          <p className="text-muted">Build automated multi-step email workflows</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn--secondary" onClick={() => navigate('/marketing/campaigns')}>
            View Campaigns
          </button>
          <button className="btn btn--primary" onClick={() => setIsModalOpen(true)}>
            <FiPlus style={{ marginRight: '0.5rem' }} /> New Sequence
          </button>
        </div>
      </div>

      <div className="page-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 8 }} />)}
          </div>
        ) : sequences.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%', background: 'hsl(var(--c2) / 0.1)',
                display: 'grid', placeItems: 'center', margin: '0 auto 1rem', color: 'var(--c2)', fontSize: '1.5rem'
              }}
            >
              <FiFileText />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No sequences yet</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>
              Create your first multi-step sequence to automate your outreach.
            </p>
            <button className="btn btn--primary" onClick={() => setIsModalOpen(true)}>
              <FiPlus style={{ marginRight: '0.5rem' }} /> Create Sequence
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sequence Name</th>
                <th>Status</th>
                <th>Contacts Enrolled</th>
                <th>Created At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sequences.map(seq => (
                <tr key={seq.id} onClick={() => navigate(`/marketing/campaigns/${seq.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{seq.name}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: getStatusColor(seq.status) }} />
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{seq.status}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{seq.total_sent.toLocaleString()}</td>
                  <td className="text-muted">{new Date(seq.created_at).toLocaleDateString()}</td>
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

      {/* New Sequence Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="page-card" style={{ width: 400, padding: '1.5rem', background: 'hsl(var(--background))' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Create New Sequence</h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Sequence Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g., Cold Outreach - Software Devs" 
                  value={newSeqName}
                  onChange={e => setNewSeqName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={creating || !newSeqName.trim()}>
                  {creating ? 'Creating...' : 'Create Sequence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
