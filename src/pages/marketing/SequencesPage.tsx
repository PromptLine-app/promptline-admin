import { useNavigate } from 'react-router-dom';
import { FiFileText, FiPlus } from 'react-icons/fi';

export const SequencesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Sequences</h1>
          <p className="text-muted">Build automated multi-step email workflows</p>
        </div>
        <button className="btn btn--primary">
          <FiPlus style={{ marginRight: '0.5rem' }} /> New Sequence
        </button>
      </div>

      <div className="page-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: '50%', background: 'hsl(var(--c2) / 0.1)',
            display: 'grid', placeItems: 'center', margin: '0 auto 1rem', color: 'var(--c2)', fontSize: '1.5rem'
          }}
        >
          <FiFileText />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Visual Sequence Builder</h3>
        <p className="text-muted" style={{ marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>
          The drag-and-drop sequence builder is currently under development. You can still manage sequence campaigns from the Campaigns hub.
        </p>
        <button className="btn btn--secondary" onClick={() => navigate('/marketing/campaigns')}>
          View Campaigns
        </button>
      </div>
    </div>
  );
};
