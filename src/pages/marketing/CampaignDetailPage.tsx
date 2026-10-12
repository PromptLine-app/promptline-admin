import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiArrowLeft, FiBarChart2, FiUsers, FiCheckCircle, FiXCircle, FiClock, FiSend, FiX, FiTrash2 } from 'react-icons/fi';
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

  // Broadcast Setup State
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSender, setSelectedSender] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('all'); // all, cold, warm, hot
  const [isSending, setIsSending] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  // Sequence Builder State
  const [sequenceSteps, setSequenceSteps] = useState<any[]>([]);
  const [showStepModal, setShowStepModal] = useState(false);
  const [newStepDelay, setNewStepDelay] = useState(3);
  const [newStepTemplate, setNewStepTemplate] = useState('');
  const [addingStep, setAddingStep] = useState(false);

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepTemplate) {
      alert("Please select an email template.");
      return;
    }
    const tmpl = templates.find(t => t.id === newStepTemplate);
    if (!tmpl) return;

    setAddingStep(true);
    try {
      const nextStepNum = sequenceSteps.length + 1;
      const { data, error } = await supabase
        .from('campaign_steps')
        .insert({
          campaign_id: id,
          step_number: nextStepNum,
          template_id: tmpl.id,
          subject: tmpl.subject || tmpl.name,
          body_html: tmpl.body_html || '<p></p>',
          wait_days: sequenceSteps.length === 0 ? 0 : Number(newStepDelay),
        })
        .select('*, email_templates(name)')
        .single();

      if (error) throw error;
      setSequenceSteps([...sequenceSteps, data]);
      setShowStepModal(false);
      setNewStepTemplate('');
      setNewStepDelay(3);
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.addStep' });
      alert(`Failed to add step: ${err.message}`);
    } finally {
      setAddingStep(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm("Are you sure you want to remove this step?")) return;
    try {
      const { error } = await supabase.from('campaign_steps').delete().eq('id', stepId);
      if (error) throw error;
      setSequenceSteps(sequenceSteps.filter(s => s.id !== stepId));
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.deleteStep' });
      alert(`Failed to delete step: ${err.message}`);
    }
  };

  const handleLaunchBroadcast = async () => {
    if (!selectedTemplate) {
      alert("Please select a template first.");
      return;
    }
    
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-launch-campaign', {
        body: {
          campaign_id: id,
          audience_filter: audienceFilter,
          template_id: selectedTemplate
        }
      });
      
      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) msg = body.error + (body.details ? `: ${body.details}` : '');
          }
        } catch (_) {}
        throw new Error(msg);
      }
      
      alert(data?.message || "Broadcast launched successfully!");
      // Reload page to reflect new status
      window.location.reload();
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.launch' });
      alert(`Failed to launch broadcast: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const fetchAnalytics = async () => {
      try {
        const [campRes, enrollRes, stepsRes, tmplRes] = await Promise.all([
          supabase.from('marketing_campaigns').select('*').eq('id', id).single(),
          supabase.from('campaign_enrollments').select('status, current_step_number').eq('campaign_id', id),
          supabase.from('campaign_steps').select('*, email_templates(name)').eq('campaign_id', id).order('step_number', { ascending: true }),
          supabase.from('email_templates').select('id, name, subject, body_html').eq('is_active', true).order('name')
        ]);

        if (campRes.error) throw campRes.error;
        if (enrollRes.error) throw enrollRes.error;
        if (stepsRes.error) throw stepsRes.error;
        if (tmplRes.error) throw tmplRes.error;

        setCampaign(campRes.data);
        setSequenceSteps(stepsRes.data || []);
        setTemplates(tmplRes.data || []);

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
      {campaign.status !== 'draft' && campaign.type === 'sequence' && (
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

      {/* Sequence Builder UI (Phase 4) */}
      {campaign.status === 'draft' && campaign.type === 'sequence' && (
        <div className="page-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FiClock /> Sequence Workflow Builder
            </h2>
            <button className="btn btn--primary" onClick={() => setShowStepModal(true)}>
              + Add Step
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            {sequenceSteps.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'hsl(var(--secondary))', borderRadius: 8, border: '1px dashed hsl(var(--border))' }}>
                <p className="text-muted">No steps added yet. Add an email step to start the sequence.</p>
              </div>
            ) : (
              sequenceSteps.map((step, index) => (
                <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '100%', padding: '1rem', background: 'hsl(var(--secondary))', borderRadius: 8, border: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontWeight: 600 }}>Step {step.step_number}: Email Send</h4>
                      <p className="text-muted" style={{ fontSize: '0.875rem' }}>Template: {step.email_templates?.name || 'Unknown Template'}</p>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn--secondary" 
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={() => handleDeleteStep(step.id)}
                    >
                      <FiTrash2 /> Remove
                    </button>
                  </div>
                  {index < sequenceSteps.length - 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ height: 20, width: 2, background: 'hsl(var(--border))' }} />
                      <span style={{ fontSize: '0.75rem', background: 'hsl(var(--background))', color: 'hsl(var(--muted-foreground))', padding: '0.2rem 0.5rem', borderRadius: 999, border: '1px solid hsl(var(--border))' }}>
                        Wait {sequenceSteps[index+1].wait_days ?? sequenceSteps[index+1].delay_days ?? 3} days
                      </span>
                      <div style={{ height: 20, width: 2, background: 'hsl(var(--border))' }} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          
          {sequenceSteps.length > 0 && (
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn--primary" 
                onClick={() => alert("The Sequence Engine is currently being built! This will lock the sequence and begin enrolling contacts.")}
              >
                Activate Sequence
              </button>
            </div>
          )}
        </div>
      )}

      {/* Broadcast Setup UI (Phase 4) */}
      {campaign.status === 'draft' && campaign.type === 'broadcast' && (
        <div className="page-card" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiSend /> Broadcast Setup
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            <div>
              <label className="form-label">Target Audience</label>
              <select className="form-input" value={audienceFilter} onChange={e => setAudienceFilter(e.target.value)}>
                <option value="all">All Active Contacts</option>
                <option value="warm">Warm Leads Only</option>
                <option value="cold">Cold Leads Only</option>
              </select>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Filter which contacts will receive this broadcast.
              </p>
            </div>

            <div>
              <label className="form-label">Email Template</label>
              <select className="form-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">— Select a template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ padding: '1.5rem', background: 'hsl(var(--secondary))', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Ready to Blast?</h4>
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                This will queue the broadcast for your selected audience.
              </p>
            </div>
            <button 
              className="btn btn--primary" 
              onClick={handleLaunchBroadcast}
              disabled={isSending || !selectedTemplate}
            >
              <FiSend style={{ marginRight: '0.5rem' }} /> {isSending ? 'Launching...' : 'Launch Broadcast'}
            </button>
          </div>
        </div>
      )}

      {/* Add Step Modal */}
      {showStepModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="page-card" style={{ width: 440, padding: '1.5rem', background: 'hsl(var(--background))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add Sequence Step</h2>
              <button 
                type="button" 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }} 
                onClick={() => setShowStepModal(false)}
              >
                <FiX size={18} />
              </button>
            </div>
            <form onSubmit={handleAddStep}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Step {sequenceSteps.length + 1} — Email Template</label>
                <select 
                  className="form-input" 
                  value={newStepTemplate} 
                  onChange={e => setNewStepTemplate(e.target.value)}
                  required
                >
                  <option value="">— Select a template —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {sequenceSteps.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">Delay After Previous Step (Days)</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={90} 
                    className="form-input" 
                    value={newStepDelay}
                    onChange={e => setNewStepDelay(Number(e.target.value))}
                    required
                  />
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Days to wait before sending this email after step {sequenceSteps.length}.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowStepModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={addingStep || !newStepTemplate}>
                  {addingStep ? 'Adding...' : 'Add Step'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
