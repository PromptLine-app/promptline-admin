import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiArrowLeft, FiBarChart2, FiUsers, FiCheckCircle, FiXCircle, FiClock, FiSend, FiX, FiTrash2, FiPlay, FiPause, FiTag, FiAlertTriangle, FiSearch, FiCheckSquare, FiSquare, FiSliders, FiList } from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingCampaign } from '@/types/domain';


export const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [stopping, setStopping] = useState(false);
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

  // Activate / Enroll Sequence Modal State
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activateFilter, setActivateFilter] = useState('all');
  const [activateTag, setActivateTag] = useState('all');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [enrollMode, setEnrollMode] = useState<'batch' | 'select' | 'all'>('batch');
  const [batchLimit, setBatchLimit] = useState(25);
  const [candidateContacts, setCandidateContacts] = useState<any[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [candidateSearch, setCandidateSearch] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<null | { enrolled: number; dropped: number; senders: string[] }>(null);

  // Reply Tagger State
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [taggingId, setTaggingId] = useState<string | null>(null);


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

  const openEnrollModal = () => {
    const name = campaign?.name?.toLowerCase() ?? '';
    if (name.includes('lawn')) setActivateTag('lawn-care');
    else if (name.includes('hvac') || name.includes('plumb')) setActivateTag('hvac-plumbing');
    else setActivateTag('all');
    setShowActivateModal(true);
  };

  useEffect(() => {
    if (!showActivateModal || !id) return;
    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      try {
        let q = supabase
          .from('email_contacts')
          .select('id, full_name, first_name, last_name, email, company, city, state, tags, engagement_state')
          .eq('status', 'active')
          .neq('engagement_state', 'suppressed')
          .not('company', 'is', null);

        if (activateFilter === 'warm') q = q.eq('engagement_state', 'warm');
        else if (activateFilter === 'cold') q = q.eq('engagement_state', 'cold');
        else if (activateFilter === 'hot') q = q.eq('engagement_state', 'hot');

        if (activateTag && activateTag !== 'all') {
          q = q.contains('tags', [activateTag]);
        }

        const { data, error } = await q;
        if (error) throw error;

        const enrolledSet = new Set(enrollments.map(e => e.contact_id));
        const eligible = (data || []).filter((c: any) => {
          if (enrolledSet.has(c.id)) return false;
          const fn = (c.first_name ?? '').trim() || (c.full_name ?? '').trim().split(/\s+/)[0];
          return fn.length > 0 && fn.toLowerCase() !== 'unknown' && (c.company ?? '').trim().length > 0;
        });

        setCandidateContacts(eligible);
        setSelectedCandidateIds(new Set());
      } catch (err) {
        reportError(err, { where: 'CampaignDetailPage.fetchCandidates' });
      } finally {
        setLoadingCandidates(false);
      }
    };
    fetchCandidates();
  }, [showActivateModal, activateTag, activateFilter, id, enrollments]);

  const handleActivateSequence = async () => {
    if (enrollMode === 'select' && selectedCandidateIds.size === 0) {
      alert("Please select at least one contact to enroll.");
      return;
    }
    if (enrollMode === 'batch' && (!batchLimit || Number(batchLimit) <= 0)) {
      alert("Please enter a valid batch size (e.g. 25).");
      return;
    }

    setActivating(true);
    setActivateResult(null);
    try {
      const body: Record<string, unknown> = {
        campaign_id: id,
        audience_filter: activateFilter,
        tag_filter: activateTag,
      };

      if (enrollMode === 'batch') {
        body.batch_limit = Number(batchLimit);
      } else if (enrollMode === 'select') {
        body.contact_ids = Array.from(selectedCandidateIds);
      }

      const { data, error } = await supabase.functions.invoke('marketing-launch-campaign', {
        body,
      });
      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const bodyJson = await error.context.json();
            if (bodyJson?.error) msg = bodyJson.error + (bodyJson.details ? `: ${bodyJson.details}` : '');
          }
        } catch (_) {}
        throw new Error(msg);
      }
      setActivateResult({
        enrolled: data?.contacts_enrolled ?? 0,
        dropped:  data?.contacts_dropped ?? 0,
        senders:  data?.senders_assigned ?? [],
      });
      setTimeout(() => { window.location.reload(); }, 2500);
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.activateSequence' });
      alert(`Failed to activate/enroll: ${err.message}`);
    } finally {
      setActivating(false);
    }
  };

  const handlePauseSequence = async () => {
    if (!id || !window.confirm("Are you sure you want to stop/pause this sequence? All pending and scheduled email sends will be immediately stopped.")) return;
    setStopping(true);
    try {
      const { error: campErr } = await supabase
        .from('marketing_campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (campErr) throw campErr;

      const { error: enrErr } = await supabase
        .from('campaign_enrollments')
        .update({ status: 'paused' })
        .eq('campaign_id', id)
        .eq('status', 'active');
      if (enrErr) throw enrErr;

      alert("Sequence stopped and paused successfully. No further emails will be sent.");
      window.location.reload();
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.pauseSequence' });
      alert(`Failed to pause sequence: ${err.message}`);
    } finally {
      setStopping(false);
    }
  };

  const handleResumeSequence = async () => {
    if (!id) return;
    setStopping(true);
    try {
      const { error: campErr } = await supabase
        .from('marketing_campaigns')
        .update({ status: 'live', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (campErr) throw campErr;

      const { error: enrErr } = await supabase
        .from('campaign_enrollments')
        .update({ status: 'active' })
        .eq('campaign_id', id)
        .eq('status', 'paused');
      if (enrErr) throw enrErr;

      alert("Sequence resumed successfully.");
      window.location.reload();
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.resumeSequence' });
      alert(`Failed to resume sequence: ${err.message}`);
    } finally {
      setStopping(false);
    }
  };

  const handleDeleteSequence = async () => {
    if (!id || !window.confirm("WARNING: Are you sure you want to permanently delete this sequence? All enrolled contacts, scheduled steps, and sequence history will be removed.")) return;
    setStopping(true);
    try {
      await supabase.from('campaign_enrollments').delete().eq('campaign_id', id);
      await supabase.from('campaign_steps').delete().eq('campaign_id', id);
      const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
      if (error) throw error;

      alert("Sequence deleted successfully.");
      navigate('/marketing/sequences');
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.deleteSequence' });
      alert(`Failed to delete sequence: ${err.message}`);
    } finally {
      setStopping(false);
    }
  };

  const handleTagEnrollment = async (enrollmentId: string, tag: string, contactId: string) => {
    setTaggingId(enrollmentId);
    try {
      // Determine seasonal reminder date
      let reminderAt: string | null = null;
      if (tag === 'not-now-spring') {
        const feb = new Date(); feb.setMonth(1); feb.setDate(15); feb.setFullYear(feb.getFullYear() + (feb < new Date() ? 1 : 0));
        reminderAt = feb.toISOString();
      } else if (tag === 'not-now-summer') {
        const apr = new Date(); apr.setMonth(3); apr.setDate(15); apr.setFullYear(apr.getFullYear() + (apr < new Date() ? 1 : 0));
        reminderAt = apr.toISOString();
      }

      // Exit the enrollment
      await supabase.from('campaign_enrollments')
        .update({ status: 'exited', reply_tag: tag, reminder_at: reminderAt })
        .eq('id', enrollmentId);

      // If unsubscribed, suppress the contact
      if (tag === 'unsubscribed') {
        await supabase.from('email_contacts')
          .update({ engagement_state: 'suppressed', unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', contactId);
      }

      // Remove from local state
      setEnrollments(prev => prev.filter(e => e.id !== enrollmentId));
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.tagEnrollment' });
      alert(`Failed to tag: ${err.message}`);
    } finally {
      setTaggingId(null);
    }
  };

  useEffect(() => {
    if (!id) return;
    const fetchAnalytics = async () => {
      try {
        const [campRes, enrollRes, stepsRes, tmplRes] = await Promise.all([
          supabase.from('marketing_campaigns').select('*').eq('id', id).single(),
          supabase.from('campaign_enrollments').select('id, status, current_step_number, contact_id, next_run_at, reply_tag, email_contacts(full_name, email, company)').eq('campaign_id', id),
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
        setEnrollments(enrollRes.data || []);

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

        // Discover distinct tags
        const { data: contactsData } = await supabase.from('email_contacts').select('tags').limit(1000);
        const tagSet = new Set<string>();
        (contactsData ?? []).forEach((c: any) => (c.tags ?? []).forEach((t: string) => tagSet.add(t)));
        setAvailableTags(Array.from(tagSet).sort());
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

        {campaign.type === 'sequence' && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {campaign.status === 'live' && (
              <button 
                className="btn"
                style={{ background: '#dc2626', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center' }}
                onClick={handlePauseSequence}
                disabled={stopping}
                title="Stop and pause this sequence immediately"
              >
                <FiPause style={{ marginRight: '0.4rem' }} />
                {stopping ? 'Stopping...' : 'Stop / Pause Sequence'}
              </button>
            )}

            {campaign.status === 'paused' && (
              <button 
                className="btn"
                style={{ background: '#16a34a', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center' }}
                onClick={handleResumeSequence}
                disabled={stopping}
                title="Resume this sequence"
              >
                <FiPlay style={{ marginRight: '0.4rem' }} />
                {stopping ? 'Resuming...' : 'Resume Sequence'}
              </button>
            )}

            <button 
              className="btn btn--primary"
              onClick={openEnrollModal}
              disabled={stopping}
            >
              <FiPlay style={{ marginRight: '0.4rem' }} />
              {campaign.status === 'live' ? 'Enroll Contacts / Add Batch' : 'Activate Sequence'}
            </button>

            <button 
              className="btn"
              style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', display: 'inline-flex', alignItems: 'center' }}
              onClick={handleDeleteSequence}
              disabled={stopping}
              title="Permanently delete this sequence"
            >
              <FiTrash2 style={{ marginRight: '0.4rem' }} /> Delete Sequence
            </button>
          </div>
        )}
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
                onClick={openEnrollModal}
              >
                <FiPlay style={{ marginRight: '0.5rem' }} /> Activate Sequence
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live Sequence — Active Enrollments Reply Tagger */}
      {campaign.type === 'sequence' && campaign.status === 'live' && enrollments.filter(e => e.status === 'active').length > 0 && (
        <div className="page-card" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiTag /> Active Prospects — Reply Actions
          </h2>
          <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
            When a prospect replies, select the appropriate tag to exit them from the sequence.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Company</th>
                <th>Step</th>
                <th>Next Send</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.filter(e => e.status === 'active').map(enr => (
                <tr key={enr.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{(enr.email_contacts as any)?.full_name ?? '—'}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{(enr.email_contacts as any)?.email}</div>
                  </td>
                  <td className="text-muted">{(enr.email_contacts as any)?.company ?? '—'}</td>
                  <td style={{ fontWeight: 500 }}>Step {enr.current_step_number}</td>
                  <td className="text-muted">{enr.next_run_at ? new Date(enr.next_run_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <select
                      className="form-input"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                      defaultValue=""
                      disabled={taggingId === enr.id}
                      onChange={e => {
                        const tag = e.target.value;
                        if (!tag) return;
                        if (confirm(`Tag this prospect as "${tag}" and exit the sequence?`)) {
                          handleTagEnrollment(enr.id, tag, enr.contact_id);
                        } else {
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">— Tag reply —</option>
                      <option value="interested">✅ Interested</option>
                      <option value="not-now-spring">🌱 Not now — remind in Feb (spring)</option>
                      <option value="not-now-summer">☀️ Not now — remind in Apr (summer)</option>
                      <option value="unsubscribed">🚫 Unsubscribed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Activate / Enroll Sequence Modal */}
      {showActivateModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="page-card" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', background: 'hsl(var(--background))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiPlay />
                {campaign.status === 'live' ? 'Enroll Contacts into Live Sequence' : 'Activate Cold Email Sequence'}
              </h2>
              <button type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }} onClick={() => { setShowActivateModal(false); setActivateResult(null); }}>
                <FiX size={18} />
              </button>
            </div>

            {activateResult ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <FiCheckCircle size={40} style={{ color: 'hsl(var(--c2))', marginBottom: '1rem' }} />
                <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Contacts Enrolled Successfully!</h3>
                <p className="text-muted">{activateResult.enrolled} contact(s) enrolled into sequence. {activateResult.dropped > 0 ? `${activateResult.dropped} dropped (missing first name or company).` : ''}</p>
                {activateResult.senders.length > 0 && <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>Assigned Send Mailboxes: {activateResult.senders.join(', ')}</p>}
                <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>Reloading sequence dashboard…</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="form-label">Target Tag (Niche / List)</label>
                    <select className="form-input" value={activateTag} onChange={e => setActivateTag(e.target.value)}>
                      <option value="all">All Tags (No tag filter)</option>
                      <option value="lawn-care">🌱 lawn-care</option>
                      <option value="hvac-plumbing">🔧 hvac-plumbing</option>
                      <option value="cedar-rapids-ia">📍 cedar-rapids-ia</option>
                      <option value="charlotte-nc">📍 charlotte-nc</option>
                      {availableTags.filter(t => !['lawn-care', 'hvac-plumbing', 'cedar-rapids-ia', 'charlotte-nc', 'csv-import'].includes(t)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Engagement State</label>
                    <select className="form-input" value={activateFilter} onChange={e => setActivateFilter(e.target.value)}>
                      <option value="all">All Active Contacts</option>
                      <option value="warm">Warm Leads Only</option>
                      <option value="cold">Cold Leads Only</option>
                      <option value="hot">Hot Leads Only</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'hsl(var(--secondary) / 0.5)', borderRadius: 6, marginBottom: '1.25rem', fontSize: '0.8rem' }}>
                  <span>Eligible un-enrolled leads:</span>
                  <span style={{ fontWeight: 700, color: 'hsl(var(--primary))' }}>
                    {loadingCandidates ? 'Calculating...' : `${candidateContacts.length} contacts`}
                  </span>
                </div>

                {/* Enrollment Mode Tabs */}
                <label className="form-label" style={{ marginBottom: '0.5rem' }}>Enrollment Strategy</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    className={`btn ${enrollMode === 'batch' ? 'btn--primary' : 'btn--secondary'}`}
                    style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    onClick={() => setEnrollMode('batch')}
                  >
                    <FiSliders /> Batch Limit
                  </button>
                  <button
                    type="button"
                    className={`btn ${enrollMode === 'select' ? 'btn--primary' : 'btn--secondary'}`}
                    style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    onClick={() => setEnrollMode('select')}
                  >
                    <FiCheckSquare /> Hand-pick ({selectedCandidateIds.size})
                  </button>
                  <button
                    type="button"
                    className={`btn ${enrollMode === 'all' ? 'btn--primary' : 'btn--secondary'}`}
                    style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    onClick={() => setEnrollMode('all')}
                  >
                    <FiUsers /> All ({candidateContacts.length})
                  </button>
                </div>

                {/* Mode 1: Batch Limit */}
                {enrollMode === 'batch' && (
                  <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Send Batch Limit</span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        Recommended for ramping up mailbox reputation
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <input
                        type="number"
                        min={1}
                        max={candidateContacts.length || 1000}
                        value={batchLimit}
                        onChange={e => setBatchLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="form-input"
                        style={{ width: 100, textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}
                      />
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {[25, 50, 100].map(size => (
                          <button
                            key={size}
                            type="button"
                            className="btn btn--secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: batchLimit === size ? 700 : 500 }}
                            onClick={() => setBatchLimit(size)}
                          >
                            {size}
                          </button>
                        ))}
                        {candidateContacts.length > 0 && (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: batchLimit === candidateContacts.length ? 700 : 500 }}
                            onClick={() => setBatchLimit(candidateContacts.length)}
                          >
                            All ({candidateContacts.length})
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem', margin: 0 }}>
                      Enrolls the next <strong>{Math.min(batchLimit, candidateContacts.length)}</strong> contacts. Founder mailboxes (Shantanu, Ranjit, Prashant) continue rotating seamlessly.
                    </p>
                  </div>
                )}

                {/* Mode 2: Hand-pick Specific Contacts */}
                {enrollMode === 'select' && (
                  <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '0.85rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ width: '100%', paddingLeft: '2rem', fontSize: '0.8rem' }}
                          placeholder="Search contacts by name, company, email..."
                          value={candidateSearch}
                          onChange={e => setCandidateSearch(e.target.value)}
                        />
                        <FiSearch style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }} />
                      </div>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          const next = new Set(selectedCandidateIds);
                          const filtered = candidateContacts.filter(c => {
                            if (!candidateSearch) return true;
                            const q = candidateSearch.toLowerCase();
                            return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
                          });
                          filtered.forEach(c => next.add(c.id));
                          setSelectedCandidateIds(next);
                        }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => setSelectedCandidateIds(new Set())}
                      >
                        Clear
                      </button>
                    </div>

                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'hsl(var(--background))' }}>
                      {loadingCandidates ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }} className="text-muted">Loading contacts...</div>
                      ) : candidateContacts.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }} className="text-muted">No eligible un-enrolled contacts.</div>
                      ) : (
                        candidateContacts
                          .filter(c => {
                            if (!candidateSearch) return true;
                            const q = candidateSearch.toLowerCase();
                            return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
                          })
                          .map(c => {
                            const isSelected = selectedCandidateIds.has(c.id);
                            return (
                              <label
                                key={c.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.6rem',
                                  padding: '0.45rem 0.75rem',
                                  borderBottom: '1px solid hsl(var(--border))',
                                  cursor: 'pointer',
                                  background: isSelected ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const next = new Set(selectedCandidateIds);
                                    if (isSelected) next.delete(c.id);
                                    else next.add(c.id);
                                    setSelectedCandidateIds(next);
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontWeight: 600 }}>{c.first_name || c.full_name}</span>
                                  {c.company && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>· {c.company}</span>}
                                  <span className="text-muted" style={{ display: 'block', fontSize: '0.72rem' }}>{c.email}</span>
                                </div>
                              </label>
                            );
                          })
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem' }} className="text-muted">
                      <span>{selectedCandidateIds.size} selected</span>
                      <span>{candidateContacts.length} total available</span>
                    </div>
                  </div>
                )}

                {/* Mode 3: All Matching */}
                {enrollMode === 'all' && (
                  <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                      Will enroll all <strong>{candidateContacts.length}</strong> eligible contacts matching tag <code>{activateTag}</code> into this sequence.
                    </p>
                  </div>
                )}

                <div style={{ background: 'hsl(var(--secondary))', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>📅 30-Day Cadence & Round-Robin Rotation</p>
                  <p className="text-muted">Day 0 → 3 → 7 → 12 → 18 → 24 → 30 (weekdays only). Leads are distributed round-robin across Shantanu, Ranjit, and Prashant.</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'hsl(var(--c3) / 0.1)', borderRadius: 8, marginBottom: '1.25rem' }}>
                  <FiAlertTriangle style={{ color: 'hsl(var(--c3))', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.8rem', color: 'hsl(var(--c3))' }}>Ensure cold email copy and founder mailboxes are fully configured before starting outreach.</p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setShowActivateModal(false)}>Cancel</button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={activating || (enrollMode === 'select' && selectedCandidateIds.size === 0) || candidateContacts.length === 0}
                    onClick={handleActivateSequence}
                  >
                    <FiPlay style={{ marginRight: '0.5rem' }} />
                    {activating
                      ? 'Enrolling…'
                      : enrollMode === 'batch'
                      ? `Enroll Batch (${Math.min(batchLimit, candidateContacts.length)} Leads)`
                      : enrollMode === 'select'
                      ? `Enroll Selected (${selectedCandidateIds.size} Leads)`
                      : `Enroll All (${candidateContacts.length} Leads)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
