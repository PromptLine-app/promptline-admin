import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBarChart2 } from 'react-icons/fi';

export const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="page-content animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => navigate('/marketing/campaigns')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          className="btn btn--secondary"
        >
          <FiArrowLeft />
        </button>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Campaign Details</h1>
          <p className="text-muted">ID: {id}</p>
        </div>
      </div>

      <div className="page-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: '50%', background: 'hsl(var(--c1) / 0.1)',
            display: 'grid', placeItems: 'center', margin: '0 auto 1rem', color: 'var(--c1)', fontSize: '1.5rem'
          }}
        >
          <FiBarChart2 />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Analytics Dashboard Coming Soon</h3>
        <p className="text-muted" style={{ marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>
          Detailed performance metrics, step-by-step breakdown, and engagement analytics will be available here.
        </p>
      </div>
    </div>
  );
};
