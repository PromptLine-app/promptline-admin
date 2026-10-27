import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import {
  FiArrowLeft, FiBarChart2, FiUsers, FiCheckCircle, FiXCircle, FiClock,
  FiSend, FiX, FiTrash2, FiPlay, FiPause, FiTag, FiAlertTriangle, FiSearch,
  FiCheckSquare, FiSquare, FiSliders, FiList, FiPlus, FiSettings, FiCalendar, FiMail
} from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingCampaign } from '@/types/domain';
import { CampaignSendHistory } from './CampaignSendHistory';

export type ReplyTagItem = {
  id: string;
  label: string;
  name: string;
  emoji?: string;
  actionType: 'positive' | 'reminder' | 'unsubscribe' | 'custom';
  reminderInterval?: 'feb' | 'apr' | '2w' | '1m' | '3m' | '6m' | 'custom';
  customReminderDate?: string;
  isDefault?: boolean;
};

export const DEFAULT_REPLY_TAGS: ReplyTagItem[] = [
  { id: 'interested', label: '✅ Interested', name: 'Interested', emoji: '✅', actionType: 'positive', isDefault: true },
  { id: 'not-now-spring', label: '🌱 Not now — remind in Feb (spring)', name: 'Remind in Feb (spring)', emoji: '🌱', actionType: 'reminder', reminderInterval: 'feb', isDefault: true },
  { id: 'not-now-summer', label: '☀️ Not now — remind in Apr (summer)', name: 'Remind in Apr (summer)', emoji: '☀️', actionType: 'reminder', reminderInterval: 'apr', isDefault: true },
  { id: 'unsubscribed', label: '🚫 Unsubscribed', name: 'Unsubscribed', emoji: '🚫', actionType: 'unsubscribe', isDefault: true },
];

export const CampaignDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'steps' | 'leads' | 'sends'>((tabParam as any) || 'steps');
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
  const [audienceTag, setAudienceTag] = useState('all');
  const [broadcastMode, setBroadcastMode] = useState<'batch' | 'select' | 'all'>('all');
  const [broadcastBatchLimit, setBroadcastBatchLimit] = useState(100);
  const [broadcastContacts, setBroadcastContacts] = useState<any[]>([]);
  const [broadcastSelectedIds, setBroadcastSelectedIds] = useState<Set<string>>(new Set());
  const [broadcastSearch, setBroadcastSearch] = useState('');
  const [loadingBroadcastContacts, setLoadingBroadcastContacts] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [senders, setSenders] = useState<any[]>([]);
  const [broadcastAvailableTags, setBroadcastAvailableTags] = useState<string[]>([]);

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

  // Customizable Reply Tags State
  const [replyTags, setReplyTags] = useState<ReplyTagItem[]>(() => {
    try {
      const saved = localStorage.getItem('promptline_reply_tags_custom');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved reply tags', e);
    }
    return DEFAULT_REPLY_TAGS;
  });

  const [showTagManagerModal, setShowTagManagerModal] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [targetEnrollmentForNewTag, setTargetEnrollmentForNewTag] = useState<{ id: string; contactId: string } | null>(null);

  // New Tag form state
  const [newTagName, setNewTagName] = useState('');
  const [newTagEmoji, setNewTagEmoji] = useState('🏷️');
  const [newTagActionType, setNewTagActionType] = useState<'positive' | 'reminder' | 'unsubscribe' | 'custom'>('custom');
  const [newTagReminderInterval, setNewTagReminderInterval] = useState<'feb' | 'apr' | '2w' | '1m' | '3m' | '6m' | 'custom'>('1m');
  const [newTagCustomDate, setNewTagCustomDate] = useState('');

  const saveReplyTags = (newTags: ReplyTagItem[]) => {
    setReplyTags(newTags);
    try {
      localStorage.setItem('promptline_reply_tags_custom', JSON.stringify(newTags));
    } catch (e) {
      console.warn('Failed to save reply tags to localStorage', e);
    }
  };

  const handleCreateCustomTag = (applyImmediately = false) => {
    if (!newTagName.trim()) {
      alert('Please enter a tag name');
      return;
    }

    const cleanName = newTagName.trim();
    const tagId = 'tag_' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString().slice(-4);
    const label = `${newTagEmoji || '🏷️'} ${cleanName}`;

    const createdTag: ReplyTagItem = {
      id: tagId,
      name: cleanName,
      emoji: newTagEmoji || '🏷️',
      label,
      actionType: newTagActionType,
      reminderInterval: newTagActionType === 'reminder' ? newTagReminderInterval : undefined,
      customReminderDate: newTagActionType === 'reminder' && newTagReminderInterval === 'custom' ? newTagCustomDate : undefined,
      isDefault: false,
    };

    const updatedTags = [...replyTags, createdTag];
    saveReplyTags(updatedTags);

    if (applyImmediately && targetEnrollmentForNewTag) {
      handleTagEnrollment(targetEnrollmentForNewTag.id, createdTag.id, targetEnrollmentForNewTag.contactId, updatedTags);
    }

    // Reset form
    setNewTagName('');
    setNewTagEmoji('🏷️');
    setNewTagActionType('custom');
    setNewTagReminderInterval('1m');
    setNewTagCustomDate('');
    setShowAddTagModal(false);
    setTargetEnrollmentForNewTag(null);
  };

  const handleDeleteCustomTag = (tagId: string) => {
    if (!confirm('Are you sure you want to delete this custom tag?')) return;
    const updated = replyTags.filter(t => t.id !== tagId);
    saveReplyTags(updated);
  };

  const handleResetDefaultTags = () => {
    if (!confirm('Reset tags back to defaults? All custom tags will be removed.')) return;
    saveReplyTags(DEFAULT_REPLY_TAGS);
  };

  // Test Send State
  const [testSendModalOpen, setTestSendModalOpen] = useState(false);
  const [testTargetStep, setTestTargetStep] = useState<any | null>(null);
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [testRecipientName, setTestRecipientName] = useState('Mayur');
  const [testCompanyName, setTestCompanyName] = useState('PromptLine');
  const [testSenderId, setTestSenderId] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setTestRecipientEmail(data.user.email);
        const namePart = (data.user.user_metadata?.first_name || data.user.user_metadata?.name || data.user.email.split('@')[0].split('.')[0] || '').trim();
        if (namePart) {
          const capitalized = namePart.charAt(0).toUpperCase() + namePart.slice(1);
          setTestRecipientName(capitalized);
        }
      }
    });
  }, []);

  const openTestSendForStep = (step: any) => {
    setTestTargetStep(step);
    setTestSuccessMessage(null);
    if (!testSenderId && senders.length > 0) {
      setTestSenderId(senders[0].id);
    }
    setTestSendModalOpen(true);
  };

  const openTestSendForBroadcast = () => {
    if (!selectedTemplate) {
      alert("Please select an email template first before sending a test.");
      return;
    }
    setTestTargetStep(null);
    setTestSuccessMessage(null);
    if (selectedSender) {
      setTestSenderId(selectedSender);
    } else if (!testSenderId && senders.length > 0) {
      setTestSenderId(senders[0].id);
    }
    setTestSendModalOpen(true);
  };

  const handleExecuteTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipientEmail || !testRecipientEmail.includes('@')) {
      alert("Please enter a valid recipient email address for the test.");
      return;
    }

    setTestSending(true);
    setTestSuccessMessage(null);
    try {
      const isSequence = campaign?.type === 'sequence';
      const effectiveName = testRecipientName.trim() || 'Mike';
      const effectiveCompany = testCompanyName.trim() || 'Ridgeline Heating & Air';

      const body: Record<string, unknown> = {
        recipient_email: testRecipientEmail.trim(),
        recipient_name: effectiveName,
        is_test: true,
        variables: {
          '{{first_name}}': effectiveName,
          '{{name}}': effectiveName,
          '{{company}}': effectiveCompany,
        },
      };

      if (testSenderId) {
        body.sender_id = testSenderId;
      } else {
        body.email_type = 'marketing';
      }

      if (testTargetStep) {
        body.is_cold_sequence = true;
        body.custom_subject = testTargetStep.subject;
        body.custom_body_html = testTargetStep.body_html;
        if (testTargetStep.template_id) body.template_id = testTargetStep.template_id;
      } else {
        body.template_id = selectedTemplate;
        body.is_cold_sequence = false;
      }

      const { data, error } = await supabase.functions.invoke('send-marketing-email', { body });

      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json();
            if (errBody?.error) msg = errBody.error + (errBody.details ? `: ${JSON.stringify(errBody.details)}` : '');
          }
        } catch (_) {}
        throw new Error(msg);
      }

      setTestSuccessMessage(`Test email successfully sent to ${testRecipientEmail}! (From: ${data?.sender || 'sender'})`);
    } catch (err: any) {
      reportError(err, { where: 'CampaignDetailPage.executeTestSend' });
      alert(`Test send failed: ${err.message}`);
    } finally {
      setTestSending(false);
    }
  };


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
    if (broadcastMode === 'select' && broadcastSelectedIds.size === 0) {
      alert("Please select at least one contact.");
      return;
    }
    
    setIsSending(true);
    try {
      const body: Record<string, unknown> = {
        campaign_id: id,
        audience_filter: audienceFilter,
        tag_filter: audienceTag !== 'all' ? audienceTag : undefined,
        template_id: selectedTemplate,
        sender_id: selectedSender || undefined,
      };

      if (broadcastMode === 'batch') {
        body.batch_limit = broadcastBatchLimit;
      } else if (broadcastMode === 'select') {
        body.contact_ids = Array.from(broadcastSelectedIds);
      }

      const { data, error } = await supabase.functions.invoke('marketing-launch-campaign', { body });
      
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
      
      alert(data?.message || `Broadcast launched! ${data?.contacts_enrolled ?? ''} contacts queued.`);
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
          const tags = Array.isArray(c.tags) ? c.tags : [];
          if (tags.includes('held-back') || tags.includes('held-back-17-oct') || tags.includes('do-not-contact')) return false;
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

  // Fetch broadcast contacts reactively when filters change
  useEffect(() => {
    if (!id || !campaign || campaign.type !== 'broadcast' || campaign.status !== 'draft') return;
    const fetchBroadcastContacts = async () => {
      setLoadingBroadcastContacts(true);
      try {
        let q = supabase
          .from('email_contacts')
          .select('id, full_name, first_name, last_name, email, company, engagement_state, tags')
          .eq('status', 'active')
          .neq('engagement_state', 'suppressed');

        if (audienceFilter === 'warm') q = q.eq('engagement_state', 'warm');
        else if (audienceFilter === 'cold') q = q.eq('engagement_state', 'cold');
        else if (audienceFilter === 'hot') q = q.eq('engagement_state', 'hot');

        if (audienceTag && audienceTag !== 'all') {
          q = q.contains('tags', [audienceTag]);
        }

        const { data, error } = await q;
        if (error) throw error;
        setBroadcastContacts(data || []);
        setBroadcastSelectedIds(new Set());
      } catch (err) {
        reportError(err, { where: 'CampaignDetailPage.fetchBroadcastContacts' });
      } finally {
        setLoadingBroadcastContacts(false);
      }
    };
    fetchBroadcastContacts();
  }, [id, campaign?.status, campaign?.type, audienceFilter, audienceTag]);

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

  const handleTagEnrollment = async (enrollmentId: string, tagId: string, contactId: string, customTagsList?: ReplyTagItem[]) => {
    setTaggingId(enrollmentId);
    try {
      const tagsList = customTagsList || replyTags;
      const tagObj = tagsList.find(t => t.id === tagId) || {
        id: tagId,
        label: tagId,
        name: tagId,
        actionType: 'custom' as const,
      };

      // Determine reminder date if actionType is reminder
      let reminderAt: string | null = null;
      if (tagObj.actionType === 'reminder') {
        const now = new Date();
        if (tagObj.reminderInterval === 'feb') {
          const feb = new Date(); feb.setMonth(1); feb.setDate(15); feb.setFullYear(feb.getFullYear() + (feb < new Date() ? 1 : 0));
          reminderAt = feb.toISOString();
        } else if (tagObj.reminderInterval === 'apr') {
          const apr = new Date(); apr.setMonth(3); apr.setDate(15); apr.setFullYear(apr.getFullYear() + (apr < new Date() ? 1 : 0));
          reminderAt = apr.toISOString();
        } else if (tagObj.reminderInterval === '2w') {
          reminderAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        } else if (tagObj.reminderInterval === '1m') {
          const d = new Date(); d.setMonth(d.getMonth() + 1); reminderAt = d.toISOString();
        } else if (tagObj.reminderInterval === '3m') {
          const d = new Date(); d.setMonth(d.getMonth() + 3); reminderAt = d.toISOString();
        } else if (tagObj.reminderInterval === '6m') {
          const d = new Date(); d.setMonth(d.getMonth() + 6); reminderAt = d.toISOString();
        } else if (tagObj.customReminderDate) {
          reminderAt = new Date(tagObj.customReminderDate).toISOString();
        }
      }

      // Exit the enrollment in Supabase
      const isStandardTag = ['interested', 'not-now-spring', 'not-now-summer', 'unsubscribed'].includes(tagObj.id);
      const fallbackTag = tagObj.actionType === 'unsubscribe' ? 'unsubscribed' : tagObj.actionType === 'reminder' ? 'not-now-spring' : 'interested';

      // Try with exact tag id first
      const { error: firstErr } = await supabase.from('campaign_enrollments')
        .update({ status: 'exited', reply_tag: tagObj.id, reply_notes: tagObj.label, reminder_at: reminderAt })
        .eq('id', enrollmentId);

      if (firstErr) {
        // Fallback to standard reply_tag with custom label in reply_notes to satisfy DB constraint if needed
        const { error: secondErr } = await supabase.from('campaign_enrollments')
          .update({
            status: 'exited',
            reply_tag: isStandardTag ? tagObj.id : fallbackTag,
            reply_notes: tagObj.label,
            reminder_at: reminderAt,
          })
          .eq('id', enrollmentId);
        if (secondErr) throw secondErr;
      }

      // Update contact in email_contacts (append tag and sync engagement state)
      try {
        const { data: cData } = await supabase.from('email_contacts').select('tags, engagement_state').eq('id', contactId).single();
        if (cData) {
          const existingTags: string[] = Array.isArray(cData.tags) ? cData.tags : [];
          const cleanTagName = tagObj.name || tagObj.label.replace(/^[^\w\s]+/, '').trim();
          const newTags = Array.from(new Set([...existingTags, cleanTagName]));

          const contactUpdates: any = { tags: newTags, updated_at: new Date().toISOString() };
          if (tagObj.actionType === 'unsubscribe') {
            contactUpdates.engagement_state = 'suppressed';
            contactUpdates.unsubscribed_at = new Date().toISOString();
          } else if (tagObj.actionType === 'positive') {
            contactUpdates.engagement_state = 'hot';
          }
          await supabase.from('email_contacts').update(contactUpdates).eq('id', contactId);
        }
      } catch (cErr) {
        console.warn('Failed to update contact tags in CRM:', cErr);
      }

      // Remove from local active enrollments state
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

        // Fetch senders and tags in parallel
        const [sendersRes, tagsRes] = await Promise.all([
          supabase.from('marketing_senders').select('id, display_name, email').eq('is_active', true),
          supabase.from('email_contacts').select('tags').not('tags', 'is', null).limit(500)
        ]);
        if (sendersRes.data) setSenders(sendersRes.data);
        if (tagsRes.data) {
          const tagSet = new Set<string>();
          tagsRes.data.forEach((c: any) => { if (Array.isArray(c.tags)) c.tags.forEach((t: string) => tagSet.add(t)); });
          const sortedTags = Array.from(tagSet).sort();
          setAvailableTags(sortedTags);
          setBroadcastAvailableTags(sortedTags);
        }

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

        {campaign.type === 'broadcast' && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {(campaign.status === 'sending' || campaign.status === 'sent') && (
              <button 
                className="btn"
                style={{ background: '#dc2626', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center' }}
                onClick={handlePauseSequence}
                disabled={stopping}
              >
                <FiPause style={{ marginRight: '0.4rem' }} />
                {stopping ? 'Stopping...' : 'Stop Broadcast'}
              </button>
            )}
            {campaign.status === 'paused' && (
              <button 
                className="btn"
                style={{ background: '#16a34a', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center' }}
                onClick={handleResumeSequence}
                disabled={stopping}
              >
                <FiPlay style={{ marginRight: '0.4rem' }} />
                {stopping ? 'Resuming...' : 'Resume Broadcast'}
              </button>
            )}
            <button 
              className="btn"
              style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', display: 'inline-flex', alignItems: 'center' }}
              onClick={handleDeleteSequence}
              disabled={stopping}
            >
              <FiTrash2 style={{ marginRight: '0.4rem' }} /> Delete Broadcast
            </button>
          </div>
        )}

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

      {/* Sequence Section Tabs */}
      {campaign.type === 'sequence' && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid hsl(var(--border))',
          paddingBottom: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <button
            type="button"
            className={`btn ${activeTab === 'steps' ? 'btn--primary' : 'btn--secondary'}`}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              borderRadius: 8,
            }}
            onClick={() => {
              setActiveTab('steps');
              setSearchParams({ tab: 'steps' });
            }}
          >
            <FiClock /> Workflow & Steps ({sequenceSteps.length})
          </button>

          <button
            type="button"
            className={`btn ${activeTab === 'leads' ? 'btn--primary' : 'btn--secondary'}`}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              borderRadius: 8,
            }}
            onClick={() => {
              setActiveTab('leads');
              setSearchParams({ tab: 'leads' });
            }}
          >
            <FiTag /> Active Prospects & Reply Tags ({enrollments.filter(e => e.status === 'active').length})
          </button>

          <button
            type="button"
            className={`btn ${activeTab === 'sends' ? 'btn--primary' : 'btn--secondary'}`}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              borderRadius: 8,
            }}
            onClick={() => {
              setActiveTab('sends');
              setSearchParams({ tab: 'sends' });
            }}
          >
            <FiMail /> Sends & Tracking History
          </button>
        </div>
      )}

      {/* Tab 1: Sequence Steps & Progress */}
      {campaign.type === 'sequence' && activeTab === 'steps' && (
        <>
          {campaign.status !== 'draft' && (
            <div className="page-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
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

          {/* Sequence Builder UI */}
          <div className="page-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiClock /> {campaign.status === 'draft' ? 'Sequence Workflow Builder' : 'Sequence Workflow Steps'}
              </h2>
              {campaign.status === 'draft' && (
                <button className="btn btn--primary" onClick={() => setShowStepModal(true)}>
                  + Add Step
                </button>
              )}
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
                        {step.subject && (
                          <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                            Subject: <em>{step.subject}</em>
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          type="button" 
                          className="btn btn--secondary" 
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => openTestSendForStep(step)}
                          title="Send a test email for this step to verify merge fields and copy"
                        >
                          <FiSend size={12} /> Send Test Email
                        </button>
                        {campaign.status === 'draft' && (
                          <button 
                            type="button" 
                            className="btn btn--secondary" 
                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={() => handleDeleteStep(step.id)}
                          >
                            <FiTrash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
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
            
            {campaign.status === 'draft' && sequenceSteps.length > 0 && (
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
        </>
      )}

      {/* Tab 2: Active Prospects & Reply Tagger */}
      {campaign.type === 'sequence' && activeTab === 'leads' && (
        <div className="page-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiTag /> Active Prospects — Reply Actions
              </h2>
              <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
                When a prospect replies, select the appropriate tag to exit them from the sequence.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowTagManagerModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.825rem', padding: '0.45rem 0.9rem' }}
            >
              <FiSettings size={14} /> Customize Reply Tags
            </button>
          </div>

          {enrollments.filter(e => e.status === 'active').length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8 }}>
              <FiTag size={28} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem', opacity: 0.6 }} />
              <h4 style={{ fontWeight: 600, margin: '0 0 0.35rem' }}>No active prospects currently in this sequence</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0 0 1rem' }}>
                All enrolled contacts have either completed the sequence or exited upon reply.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={openEnrollModal}
                style={{ fontSize: '0.8rem' }}
              >
                <FiPlay style={{ marginRight: '0.4rem' }} /> Enroll Contacts / Add Batch
              </button>
            </div>
          ) : (
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
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', minWidth: 210, cursor: 'pointer' }}
                        defaultValue=""
                        disabled={taggingId === enr.id}
                        onChange={e => {
                          const val = e.target.value;
                          if (!val) return;
                          if (val === '__add_custom__') {
                            setTargetEnrollmentForNewTag({ id: enr.id, contactId: enr.contact_id });
                            setShowAddTagModal(true);
                            e.target.value = '';
                            return;
                          }
                          if (val === '__manage_tags__') {
                            setShowTagManagerModal(true);
                            e.target.value = '';
                            return;
                          }

                          const tagObj = replyTags.find(t => t.id === val);
                          if (!tagObj) return;

                          if (confirm(`Tag this prospect as "${tagObj.label}" and exit the sequence?`)) {
                            handleTagEnrollment(enr.id, val, enr.contact_id);
                          } else {
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">— Tag reply —</option>
                        {replyTags.map(tag => (
                          <option key={tag.id} value={tag.id}>
                            {tag.label}
                          </option>
                        ))}
                        <option disabled>──────────</option>
                        <option value="__add_custom__">➕ + Add custom tag...</option>
                        <option value="__manage_tags__">⚙️ Customize tags...</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Sends & Tracking History */}
      {campaign.type === 'sequence' && activeTab === 'sends' && (
        <CampaignSendHistory
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignType="sequence"
          enrolledContactIds={enrollments.map(e => e.contact_id).filter(Boolean)}
          senders={senders}
        />
      )}

      {/* Broadcast Sent History (if broadcast has been launched or completed) */}
      {campaign.type === 'broadcast' && campaign.status !== 'draft' && (
        <CampaignSendHistory
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignType="broadcast"
          enrolledContactIds={[]}
          senders={senders}
        />
      )}


      {/* Broadcast Setup UI */}
      {campaign.status === 'draft' && campaign.type === 'broadcast' && (
        <div className="page-card" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiSend /> Broadcast Setup
          </h2>
          <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1.75rem' }}>Configure your target audience and email template, then launch.</p>

          {/* Row 1: Template + Sender */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label className="form-label">Email Template *</label>
              <select className="form-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">— Select a template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Send From (optional)</label>
              <select className="form-input" value={selectedSender} onChange={e => setSelectedSender(e.target.value)}>
                <option value="">— Round-robin (auto-assign) —</option>
                {senders.map(s => (
                  <option key={s.id} value={s.id}>{(s.display_name || s.name || s.email)} &lt;{s.email}&gt;</option>
                ))}
              </select>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>Leave blank to auto-rotate across all active mailboxes.</p>
            </div>
          </div>

          {/* Row 2: Audience Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label className="form-label">Engagement State</label>
              <select className="form-input" value={audienceFilter} onChange={e => setAudienceFilter(e.target.value)}>
                <option value="all">All Active Contacts</option>
                <option value="warm">Warm Leads Only</option>
                <option value="cold">Cold Leads Only</option>
                <option value="hot">Hot Leads Only</option>
              </select>
            </div>
            <div>
              <label className="form-label">Target Tag / Niche</label>
              <select className="form-input" value={audienceTag} onChange={e => setAudienceTag(e.target.value)}>
                <option value="all">All Tags (No filter)</option>
                {broadcastAvailableTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Candidate Count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.9rem', background: 'hsl(var(--secondary) / 0.5)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <span>Matching contacts available:</span>
            <span style={{ fontWeight: 700, color: 'hsl(var(--primary))' }}>
              {loadingBroadcastContacts ? 'Calculating...' : `${broadcastContacts.length} contacts`}
            </span>
          </div>

          {/* Enrollment Strategy Tabs */}
          <label className="form-label" style={{ marginBottom: '0.5rem' }}>Send Strategy</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <button
              type="button"
              className={`btn ${broadcastMode === 'all' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              onClick={() => setBroadcastMode('all')}
            >
              <FiUsers /> All ({broadcastContacts.length})
            </button>
            <button
              type="button"
              className={`btn ${broadcastMode === 'batch' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              onClick={() => setBroadcastMode('batch')}
            >
              <FiSliders /> Batch Limit
            </button>
            <button
              type="button"
              className={`btn ${broadcastMode === 'select' ? 'btn--primary' : 'btn--secondary'}`}
              style={{ padding: '0.5rem 0.25rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              onClick={() => setBroadcastMode('select')}
            >
              <FiCheckSquare /> Hand-pick ({broadcastSelectedIds.size})
            </button>
          </div>

          {/* Mode: Batch */}
          {broadcastMode === 'batch' && (
            <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Send to first N contacts</span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>Useful for staged rollouts</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <input
                  type="number"
                  min={1}
                  max={broadcastContacts.length || 10000}
                  value={broadcastBatchLimit}
                  onChange={e => setBroadcastBatchLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="form-input"
                  style={{ width: 100, textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}
                />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {[50, 100, 250, 500].map(size => (
                    <button
                      key={size}
                      type="button"
                      className="btn btn--secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: broadcastBatchLimit === size ? 700 : 500 }}
                      onClick={() => setBroadcastBatchLimit(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Will send to <strong>{Math.min(broadcastBatchLimit, broadcastContacts.length)}</strong> contacts.
              </p>
            </div>
          )}

          {/* Mode: Hand-pick */}
          {broadcastMode === 'select' && (
            <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '0.85rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', paddingLeft: '2rem', fontSize: '0.8rem' }}
                    placeholder="Search by name, company, email..."
                    value={broadcastSearch}
                    onChange={e => setBroadcastSearch(e.target.value)}
                  />
                  <FiSearch style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }} />
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => {
                    const next = new Set(broadcastSelectedIds);
                    broadcastContacts
                      .filter(c => {
                        if (!broadcastSearch) return true;
                        const q = broadcastSearch.toLowerCase();
                        return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
                      })
                      .forEach(c => next.add(c.id));
                    setBroadcastSelectedIds(next);
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setBroadcastSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'hsl(var(--background))' }}>
                {loadingBroadcastContacts ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }} className="text-muted">Loading contacts...</div>
                ) : broadcastContacts.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }} className="text-muted">No contacts match the current filters.</div>
                ) : (
                  broadcastContacts
                    .filter(c => {
                      if (!broadcastSearch) return true;
                      const q = broadcastSearch.toLowerCase();
                      return (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
                    })
                    .map(c => {
                      const isSel = broadcastSelectedIds.has(c.id);
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            padding: '0.45rem 0.75rem', borderBottom: '1px solid hsl(var(--border))',
                            cursor: 'pointer',
                            background: isSel ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                            fontSize: '0.8rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => {
                              const next = new Set(broadcastSelectedIds);
                              if (isSel) next.delete(c.id); else next.add(c.id);
                              setBroadcastSelectedIds(next);
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{c.first_name || c.full_name}</span>
                            {c.company && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>· {c.company}</span>}
                            <span className="text-muted" style={{ display: 'block', fontSize: '0.72rem' }}>{c.email}</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 999, background: 'hsl(var(--secondary))' }} className="text-muted">{c.engagement_state}</span>
                        </label>
                      );
                    })
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem' }} className="text-muted">
                <span>{broadcastSelectedIds.size} selected</span>
                <span>{broadcastContacts.length} total matching</span>
              </div>
            </div>
          )}

          {/* Mode: All */}
          {broadcastMode === 'all' && broadcastContacts.length > 0 && (
            <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid hsl(var(--border))' }}>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                Will send to all <strong>{broadcastContacts.length}</strong> contacts matching the current filters.
              </p>
            </div>
          )}

          {/* Launch Row */}
          <div style={{ paddingTop: '1.5rem', borderTop: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Ready to Send?</p>
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                {broadcastMode === 'all' ? `Sending to ${broadcastContacts.length} contacts` :
                 broadcastMode === 'batch' ? `Sending to ${Math.min(broadcastBatchLimit, broadcastContacts.length)} contacts` :
                 `Sending to ${broadcastSelectedIds.size} selected contacts`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button"
                className="btn btn--secondary" 
                onClick={openTestSendForBroadcast}
                disabled={!selectedTemplate}
                title="Send a single test email to your inbox before launching the broadcast"
              >
                <FiSend style={{ marginRight: '0.5rem' }} /> Send Test Email
              </button>
              <button 
                className="btn btn--primary" 
                onClick={handleLaunchBroadcast}
                disabled={isSending || !selectedTemplate || (broadcastMode === 'select' && broadcastSelectedIds.size === 0)}
              >
                <FiPlay style={{ marginRight: '0.5rem' }} /> {isSending ? 'Launching...' : 'Launch Broadcast'}
              </button>
            </div>
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
                      {availableTags.filter(t => t !== 'csv-import').map(t => (
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
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>📅 30-Day Cadence & City Mailbox Routing</p>
                  <p className="text-muted">Day 0 → 3 → 7 → 12 → 18 → 24 → 30 (7 days a week, calendar days). Charlotte leads are sent by Shantanu, Cedar Rapids leads by Ranjit.</p>
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
      {/* Test Send Modal */}
      {testSendModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div className="page-card" style={{ width: 540, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', background: 'hsl(var(--background))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiSend /> Send Test Email
              </h2>
              <button type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }} onClick={() => setTestSendModalOpen(false)}>
                <FiX size={18} />
              </button>
            </div>

            {testSuccessMessage ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <FiCheckCircle size={44} style={{ color: 'hsl(var(--c2))', marginBottom: '1rem' }} />
                <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Test Email Sent!</h3>
                <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>{testSuccessMessage}</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setTestSuccessMessage(null)}>Send Another Test</button>
                  <button type="button" className="btn btn--primary" onClick={() => setTestSendModalOpen(false)}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteTestSend}>
                <div style={{ padding: '0.75rem', background: 'hsl(var(--secondary) / 0.6)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {testTargetStep ? `Sequence Step ${testTargetStep.step_number}` : 'Broadcast Email'}
                  </p>
                  <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
                    Subject: <strong>{testTargetStep?.subject || templates.find(t => t.id === selectedTemplate)?.subject || '(from template)'}</strong>
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Send From Mailbox *</label>
                  <select
                    className="form-input"
                    value={testSenderId}
                    onChange={e => setTestSenderId(e.target.value)}
                  >
                    <option value="">— Auto-select founder mailbox —</option>
                    {senders.map(s => (
                      <option key={s.id} value={s.id}>
                        {(s.display_name || s.name || s.email)} &lt;{s.email}&gt;
                      </option>
                    ))}
                  </select>
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
                    Select which founder mailbox will send this test email.
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Test Recipient Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    placeholder="e.g. your-email@promptline.app"
                    value={testRecipientEmail}
                    onChange={e => setTestRecipientEmail(e.target.value)}
                  />
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
                    The email address where this test will be delivered.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label className="form-label">Recipient First Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Mayur"
                      value={testRecipientName}
                      onChange={e => setTestRecipientName(e.target.value)}
                    />
                    <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                      Replaces <code>&#123;&#123;first_name&#125;&#125;</code>
                    </p>
                  </div>
                  <div>
                    <label className="form-label">Recipient Company</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. PromptLine"
                      value={testCompanyName}
                      onChange={e => setTestCompanyName(e.target.value)}
                    />
                    <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                      Replaces <code>&#123;&#123;company&#125;&#125;</code>
                    </p>
                  </div>
                </div>

                <div style={{ background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, padding: '0.85rem', marginBottom: '1.5rem', fontSize: '0.78rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Merge Variables Preview</p>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'hsl(var(--muted-foreground))' }}>
                    <li><code>&#123;&#123;first_name&#125;&#125;</code> &rarr; <strong>{testRecipientName.trim() || 'Mike'}</strong></li>
                    <li><code>&#123;&#123;company&#125;&#125;</code> &rarr; <strong>{testCompanyName.trim() || 'Ridgeline Heating & Air'}</strong></li>
                    <li><code>&#123;&#123;sender_first_name&#125;&#125;</code> &rarr; sender&apos;s first name (e.g. Shantanu / Ranjit)</li>
                  </ul>
                  <p style={{ marginTop: '0.5rem', marginBottom: 0, color: 'hsl(var(--muted-foreground))' }}>
                    The subject will be prefixed with <code>[TEST]</code>. No campaign or lead records will be updated.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setTestSendModalOpen(false)}>Cancel</button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={testSending || !testRecipientEmail}
                  >
                    <FiSend style={{ marginRight: '0.4rem' }} />
                    {testSending ? 'Sending Test…' : 'Send Test Now'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Customize Reply Tags Manager Modal */}
      {showTagManagerModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div className="page-card" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', background: 'hsl(var(--background))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FiSettings /> Customize Reply Tags
                </h2>
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                  Configure tags used to categorize prospect replies and exit sequences.
                </p>
              </div>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                onClick={() => setShowTagManagerModal(false)}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Tags List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
              {replyTags.map(tag => {
                const isDefault = tag.isDefault;
                return (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: 'hsl(var(--secondary) / 0.5)',
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{tag.emoji || '🏷️'}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {tag.name || tag.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.1rem 0.45rem',
                              borderRadius: 4,
                              background: tag.actionType === 'positive' 
                                ? 'hsl(142 71% 45% / 0.15)' 
                                : tag.actionType === 'reminder' 
                                ? 'hsl(38 92% 50% / 0.15)' 
                                : tag.actionType === 'unsubscribe' 
                                ? 'hsl(0 84% 60% / 0.15)' 
                                : 'hsl(260 80% 60% / 0.15)',
                              color: tag.actionType === 'positive' 
                                ? 'hsl(142 71% 45%)' 
                                : tag.actionType === 'reminder' 
                                ? 'hsl(38 92% 50%)' 
                                : tag.actionType === 'unsubscribe' 
                                ? 'hsl(0 84% 60%)' 
                                : 'hsl(260 80% 60%)',
                            }}
                          >
                            {tag.actionType === 'positive' && 'Interested / Hot'}
                            {tag.actionType === 'reminder' && `Remind Later (${tag.reminderInterval || 'custom'})`}
                            {tag.actionType === 'unsubscribe' && 'Unsubscribe / Suppress'}
                            {tag.actionType === 'custom' && 'Custom Action'}
                          </span>
                          {isDefault && (
                            <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                              • System Default
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomTag(tag.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'hsl(var(--destructive))',
                          cursor: 'pointer',
                          padding: '0.35rem',
                          borderRadius: 4,
                        }}
                        title="Delete custom tag"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid hsl(var(--border))', paddingTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleResetDefaultTags}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                Reset to Defaults
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setShowTagManagerModal(false);
                    setShowAddTagModal(true);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem' }}
                >
                  <FiPlus size={14} /> Add New Tag
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowTagManagerModal(false)}
                  style={{ fontSize: '0.825rem' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Reply Tag Modal */}
      {showAddTagModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 130 }}>
          <div className="page-card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', background: 'hsl(var(--background))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiPlus /> Add Custom Reply Tag
              </h2>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                onClick={() => {
                  setShowAddTagModal(false);
                  setTargetEnrollmentForNewTag(null);
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCustomTag(!!targetEnrollmentForNewTag);
              }}
            >
              {/* Tag Name */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Tag Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Demo Booked, Bad Timing, Referral, Pricing Question"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {/* Emoji Picker */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Emoji Icon</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={newTagEmoji}
                    onChange={e => setNewTagEmoji(e.target.value)}
                    style={{ width: 60, textAlign: 'center', fontSize: '1.2rem', padding: '0.3rem' }}
                    maxLength={4}
                  />
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>Pick an icon below or type any emoji</span>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {['🎯', '📅', '🤝', '✅', '❌', '💰', '📞', '⏳', '🍂', '☀️', '🌱', '❄️', '🚫', '🏷️', '💼', '⭐'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewTagEmoji(emoji)}
                      style={{
                        padding: '0.35rem 0.5rem',
                        fontSize: '1.1rem',
                        background: newTagEmoji === emoji ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--secondary))',
                        border: newTagEmoji === emoji ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Behavior */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Action Behavior</label>
                <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
                  What should happen when this tag is selected for a prospect?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    { type: 'positive', label: '🎯 Interested / Positive', desc: 'Exits sequence and updates prospect status to Hot' },
                    { type: 'reminder', label: '⏳ Remind Later', desc: 'Exits sequence and schedules a follow-up reminder' },
                    { type: 'unsubscribe', label: '🚫 Unsubscribe / Suppress', desc: 'Exits sequence and marks prospect suppressed from all future emails' },
                    { type: 'custom', label: '🏷️ Custom Tag & Exit', desc: 'Exits sequence and attaches this custom tag to contact in CRM' },
                  ].map(opt => (
                    <label
                      key={opt.type}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.65rem',
                        padding: '0.65rem 0.85rem',
                        background: newTagActionType === opt.type ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--secondary) / 0.4)',
                        border: newTagActionType === opt.type ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="actionType"
                        value={opt.type}
                        checked={newTagActionType === opt.type}
                        onChange={() => setNewTagActionType(opt.type as any)}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{opt.label}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* If Reminder: Interval selector */}
              {newTagActionType === 'reminder' && (
                <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'hsl(var(--secondary) / 0.4)', borderRadius: 8, border: '1px solid hsl(var(--border))' }}>
                  <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FiCalendar size={14} /> Reminder Interval
                  </label>
                  <select
                    className="form-input"
                    value={newTagReminderInterval}
                    onChange={e => setNewTagReminderInterval(e.target.value as any)}
                    style={{ marginBottom: newTagReminderInterval === 'custom' ? '0.75rem' : 0 }}
                  >
                    <option value="2w">In 2 Weeks</option>
                    <option value="1m">In 1 Month</option>
                    <option value="3m">In 3 Months</option>
                    <option value="6m">In 6 Months</option>
                    <option value="feb">Next Spring (Feb 15)</option>
                    <option value="apr">Next Summer (Apr 15)</option>
                    <option value="custom">Specific Custom Date...</option>
                  </select>

                  {newTagReminderInterval === 'custom' && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Select Reminder Date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={newTagCustomDate}
                        onChange={e => setNewTagCustomDate(e.target.value)}
                        required={newTagReminderInterval === 'custom'}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Preview */}
              <div style={{ background: 'hsl(var(--secondary) / 0.5)', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Dropdown Preview:</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {newTagEmoji || '🏷️'} {newTagName.trim() || 'Custom Tag Name'}
                </span>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setShowAddTagModal(false);
                    setTargetEnrollmentForNewTag(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={!newTagName.trim()}
                >
                  {targetEnrollmentForNewTag ? 'Save & Tag Prospect' : 'Save Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
