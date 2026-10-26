import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { EmailContact } from '@/types/domain';
import {
  FiRefreshCw, FiUpload, FiDownload,
  FiX, FiCheck, FiAlertCircle, FiExternalLink, FiTag, FiPlay, FiUserPlus, FiPlus,
  FiClock, FiMail, FiList,
} from 'react-icons/fi';

const SOURCE_LABELS: Record<string, string> = {
  calculator_lead: 'Calculator Lead',
  contact_request: 'Contact Request',
  user_followup: 'User Follow-up',
  csv_import: 'CSV Import',
  manual: 'Manual',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Timeline event types
type TimelineEvent = {
  id: string;
  kind: 'enrolled' | 'email_sent' | 'email_failed' | 'suppressed' | 'completed';
  label: string;
  detail?: string;
  timestamp: string;
};

// RFC-4180 compliant CSV parser that correctly handles quoted strings containing commas
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

export const ContactsPage = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvTags, setCsvTags] = useState<string>('csv-import');
  const [showImportModal, setShowImportModal] = useState(false);

  // Selection & Sequence Enrollment State
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  // Single Contact Add / Edit Modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [isNewContact, setIsNewContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editEngagementState, setEditEngagementState] = useState('warm');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Batch Tag Modal
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchTagAction, setBatchTagAction] = useState<'add' | 'remove'>('add');
  const [savingBatchTags, setSavingBatchTags] = useState(false);

  // Enrollment map: contactId -> { campaignName, stepNumber, status, nextRunAt }
  const [enrollmentMap, setEnrollmentMap] = useState<Record<string, {
    campaignName: string;
    stepNumber: number;
    status: string;
    nextRunAt: string | null;
  }[]>>({});

  // Timeline drawer
  const [timelineContact, setTimelineContact] = useState<EmailContact | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_contacts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContacts((data ?? []) as EmailContact[]);

      // Fetch active enrollments with campaign names (read-only, zero production impact)
      const { data: enrollments } = await supabase
        .from('campaign_enrollments')
        .select('contact_id, current_step_number, status, next_run_at, marketing_campaigns(name)')
        .in('status', ['active', 'completed', 'suppressed']);

      if (enrollments) {
        const map: Record<string, { campaignName: string; stepNumber: number; status: string; nextRunAt: string | null }[]> = {};
        for (const e of enrollments as any[]) {
          const cid = e.contact_id as string;
          if (!map[cid]) map[cid] = [];
          map[cid].push({
            campaignName: (e.marketing_campaigns as any)?.name ?? 'Unknown',
            stepNumber: e.current_step_number,
            status: e.status,
            nextRunAt: e.next_run_at,
          });
        }
        setEnrollmentMap(map);
      }
    } catch (err) {
      reportError(err, { where: 'ContactsPage.load' });
      toast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Open timeline drawer for a contact
  const openTimeline = async (contact: EmailContact) => {
    setTimelineContact(contact);
    setTimelineEvents([]);
    setTimelineLoading(true);

    try {
      const events: TimelineEvent[] = [];

      // 1. Fetch enrollments (with campaign name and step)
      const { data: enrollments } = await supabase
        .from('campaign_enrollments')
        .select('id, current_step_number, status, next_run_at, enrolled_at, marketing_campaigns(name)')
        .eq('contact_id', contact.id)
        .order('enrolled_at', { ascending: true });

      for (const enr of (enrollments as any[]) ?? []) {
        const campName = (enr.marketing_campaigns as any)?.name ?? 'Unknown Sequence';
        events.push({
          id: `enr-enrolled-${enr.id}`,
          kind: 'enrolled',
          label: `Added to sequence "${campName}"`,
          timestamp: enr.enrolled_at,
        });
        if (enr.status === 'suppressed') {
          events.push({
            id: `enr-suppressed-${enr.id}`,
            kind: 'suppressed',
            label: `Removed from sequence "${campName}"`,
            detail: 'Suppressed / unsubscribed',
            timestamp: enr.next_run_at ?? enr.enrolled_at,
          });
        }
        if (enr.status === 'completed') {
          events.push({
            id: `enr-completed-${enr.id}`,
            kind: 'completed',
            label: `Completed sequence "${campName}"`,
            timestamp: enr.next_run_at ?? enr.enrolled_at,
          });
        }
      }

      // 2. Fetch all emails sent to this contact
      const { data: sends } = await supabase
        .from('email_sends')
        .select('id, subject, status, created_at, is_cold_sequence')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true });

      for (const s of (sends as any[]) ?? []) {
        events.push({
          id: `send-${s.id}`,
          kind: s.status === 'sent' ? 'email_sent' : 'email_failed',
          label: s.status === 'sent' ? `Email sent` : `Email failed to send`,
          detail: s.subject,
          timestamp: s.created_at,
        });
      }

      // Sort all events chronologically
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setTimelineEvents(events);
    } catch (err) {
      reportError(err, { where: 'ContactsPage.openTimeline' });
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    const fetchSequences = async () => {
      try {
        const { data } = await supabase
          .from('marketing_campaigns')
          .select('id, name, status, type, campaign_steps(count)')
          .eq('type', 'sequence')
          .in('status', ['draft', 'live', 'paused'])
          .order('created_at', { ascending: false });

        const list = (data || []).map((s: any) => ({
          ...s,
          step_count: s.campaign_steps?.[0]?.count ?? 0,
        }));
        setSequences(list);
        const firstReady = list.find((s: any) => s.step_count > 0);
        if (firstReady) {
          setSelectedSequenceId(firstReady.id);
        } else if (list.length > 0) {
          setSelectedSequenceId(list[0].id);
        }
      } catch (err) {
        reportError(err, { where: 'ContactsPage.fetchSequences' });
      }
    };
    fetchSequences();
  }, []);

  // Extract all distinct tags from contacts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => (c.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const syncCalculatorLeads = async () => {
    setSyncing(true);
    try {
      const { data: leads, error } = await supabase
        .from('calculator_leads')
        .select('id, full_name, work_email, phone, business_name, industry, monthly_loss')
        .not('work_email', 'is', null);
      if (error) throw error;

      const seenEmails = new Set<string>();
      const upserts: any[] = [];
      for (const l of leads ?? []) {
        const cleanEmail = (l.work_email ?? '').trim().toLowerCase();
        if (!cleanEmail || seenEmails.has(cleanEmail)) continue;
        seenEmails.add(cleanEmail);
        upserts.push({
          full_name: l.full_name ?? 'Unknown',
          email: cleanEmail,
          phone: l.phone ?? null,
          company: l.business_name ?? null,
          lead_source: 'calculator_lead',
          source_id: l.id,
          industry: l.industry ?? null,
          monthly_loss: l.monthly_loss ?? null,
          status: 'active',
          engagement_state: 'warm',
          tags: ['calculator'],
        });
      }

      if (upserts.length === 0) { toast('No calculator leads with email found', 'error'); return; }

      try {
        await adminApi('/api/admin/contacts', 'POST', { contacts: upserts });
      } catch (apiErr) {
        const { error: upsertErr } = await supabase
          .from('email_contacts')
          .upsert(upserts, { onConflict: 'email,lead_source' });
        if (upsertErr) throw upsertErr;
      }

      toast(`Synced ${upserts.length} calculator leads!`, 'success');
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.syncCalculator' });
      toast(err?.message || 'Failed to sync calculator leads', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const syncContactRequests = async () => {
    setSyncing(true);
    try {
      const { data: requests, error } = await supabase
        .from('contact_submissions')
        .select('*');
      if (error) throw error;

      const seenEmails = new Set<string>();
      const upserts: any[] = [];
      for (const r of (requests as any[]) ?? []) {
        const rawEmail = r.business_email || r.email || '';
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (!cleanEmail || seenEmails.has(cleanEmail)) continue;
        seenEmails.add(cleanEmail);
        upserts.push({
          full_name: r.full_name || r.name || 'Unknown',
          email: cleanEmail,
          phone: r.business_phone || r.phone || null,
          company: r.business_name || r.company || null,
          lead_source: 'contact_request',
          source_id: r.id,
          status: 'active',
          engagement_state: 'warm',
          tags: ['contact-request'],
        });
      }

      if (upserts.length === 0) { toast('No contact requests with email found', 'error'); return; }

      try {
        await adminApi('/api/admin/contacts', 'POST', { contacts: upserts });
      } catch (apiErr) {
        const { error: upsertErr } = await supabase
          .from('email_contacts')
          .upsert(upserts, { onConflict: 'email,lead_source' });
        if (upsertErr) throw upsertErr;
      }

      toast(`Synced ${upserts.length} contact requests!`, 'success');
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.syncContacts' });
      toast(err?.message || 'Failed to sync contact requests', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Suggest default tag from filename if recognized
    const filename = file.name.toLowerCase();
    const suggestedTags: string[] = ['csv-import'];
    if (filename.includes('lawn')) suggestedTags.push('lawn-care', 'sequence-a');
    if (filename.includes('hvac') || filename.includes('plumbing')) suggestedTags.push('hvac-plumbing', 'sequence-b');
    if (filename.includes('cedar') || filename.includes('rapids')) suggestedTags.push('cedar-rapids-ia');
    if (filename.includes('charlotte')) suggestedTags.push('charlotte-nc');
    setCsvTags(suggestedTags.join(', '));

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast('CSV file appears empty or missing rows', 'error');
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(l => parseCsvLine(l));
      setCsvPreview({ headers, rows: rows.slice(0, 5) });

      // Smart auto-mapping
      const mapping: Record<string, string> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase().trim();
        if (lower === 'email' || lower.includes('email')) mapping.email = h;
        else if (lower === 'first_name' || lower === 'firstname' || lower === 'first name') mapping.first_name = h;
        else if (lower === 'last_name' || lower === 'lastname' || lower === 'last name') mapping.last_name = h;
        else if (lower === 'name' || lower === 'full_name' || lower === 'fullname') mapping.full_name = h;
        else if (lower === 'company' || lower.includes('company') || lower.includes('business')) mapping.company = h;
        else if (lower === 'phone' || lower.includes('phone') || lower.includes('mobile')) mapping.phone = h;
        else if (lower === 'website' || lower.includes('website') || lower === 'url') mapping.website = h;
        else if (lower === 'city') mapping.city = h;
        else if (lower === 'state') mapping.state = h;
      });
      setCsvMapping(mapping);
      setShowImportModal(true);
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (!csvPreview || !csvMapping.email) { toast('Please map the Email column', 'error'); return; }
    setImporting(true);
    try {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(l => parseCsvLine(l));

      const getVal = (row: string[], field: string) => {
        const mapped = csvMapping[field];
        if (!mapped) return null;
        const idx = headers.indexOf(mapped);
        return idx >= 0 ? (row[idx]?.trim() || null) : null;
      };

      const customTags = csvTags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (!customTags.includes('csv-import')) customTags.unshift('csv-import');

      const seenEmails = new Set<string>();
      const upserts: any[] = [];

      for (const row of rows) {
        const email = getVal(row, 'email')?.toLowerCase();
        if (!email || seenEmails.has(email)) continue;
        seenEmails.add(email);

        const firstName = getVal(row, 'first_name');
        const lastName = getVal(row, 'last_name');
        let fullName = getVal(row, 'full_name');
        if (!fullName && (firstName || lastName)) {
          fullName = [firstName, lastName].filter(Boolean).join(' ');
        }

        upserts.push({
          email,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName || 'Unknown',
          company: getVal(row, 'company'),
          phone: getVal(row, 'phone'),
          website: getVal(row, 'website'),
          city: getVal(row, 'city'),
          state: getVal(row, 'state'),
          lead_source: 'csv_import',
          status: 'active',
          engagement_state: 'warm',
          tags: customTags,
        });
      }

      if (upserts.length === 0) {
        toast('No valid contact rows found', 'error');
        return;
      }

      // Batch upsert in chunks of 100 to avoid payload size limits
      const CHUNK_SIZE = 100;
      for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
        const chunk = upserts.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('email_contacts')
          .upsert(chunk, { onConflict: 'email,lead_source' });
        if (error) throw error;
      }

      toast(`Successfully imported ${upserts.length} contacts!`, 'success');
      setShowImportModal(false);
      setCsvPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.importCSV' });
      toast(err?.message || 'Failed to import contacts', 'error');
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['First Name', 'Last Name', 'Full Name', 'Email', 'Company', 'Phone', 'Website', 'City', 'State', 'Tags', 'Source', 'Status', 'Last Emailed'],
      ...contacts.map(c => [
        c.first_name ?? '',
        c.last_name ?? '',
        c.full_name,
        c.email,
        c.company ?? '',
        c.phone ?? '',
        c.website ?? '',
        c.city ?? '',
        c.state ?? '',
        (c.tags ?? []).join('; '),
        c.lead_source,
        c.status,
        fmtDate(c.last_emailed_at),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'contacts.csv'; a.click();
  };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q) ||
      (c.state ?? '').toLowerCase().includes(q);
    const matchSource = !sourceFilter || c.lead_source === sourceFilter;
    const matchTag = !tagFilter || (c.tags ?? []).includes(tagFilter);
    return matchSearch && matchSource && matchTag;
  });

  const isAllFilteredSelected = filtered.length > 0 && filtered.every(c => selectedContactIds.has(c.id));
  const isSomeFilteredSelected = filtered.some(c => selectedContactIds.has(c.id));

  const toggleSelectAllFiltered = () => {
    const next = new Set(selectedContactIds);
    if (isAllFilteredSelected) {
      filtered.forEach(c => next.delete(c.id));
    } else {
      filtered.forEach(c => next.add(c.id));
    }
    setSelectedContactIds(next);
  };

  const toggleSelectContact = (id: string) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContactIds(next);
  };

  const handleEnrollSelectedInSequence = async () => {
    if (!selectedSequenceId || selectedContactIds.size === 0) return;
    setEnrolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-launch-campaign', {
        body: {
          campaign_id: selectedSequenceId,
          contact_ids: Array.from(selectedContactIds),
        },
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

      toast(
        `Successfully enrolled ${data?.contacts_enrolled ?? selectedContactIds.size} contact(s) into sequence!`,
        'success'
      );
      setSelectedContactIds(new Set());
      setShowSequenceModal(false);
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.enrollInSequence' });
      toast(err?.message || 'Failed to enroll contacts', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const openAddContactModal = () => {
    setIsNewContact(true);
    setEditingContactId(null);
    setEditFirstName('');
    setEditLastName('');
    setEditEmail('');
    setEditCompany('');
    setEditPhone('');
    setEditWebsite('');
    setEditCity('');
    setEditState('');
    setEditTags(['manual']);
    setNewTagInput('');
    setShowContactModal(true);
  };

  const openEditContactModal = (c: EmailContact) => {
    setIsNewContact(false);
    setEditingContactId(c.id);
    setEditFirstName(c.first_name || '');
    setEditLastName(c.last_name || '');
    setEditEmail(c.email || '');
    setEditCompany(c.company || '');
    setEditPhone(c.phone || '');
    setEditWebsite(c.website || '');
    setEditCity(c.city || '');
    setEditState(c.state || '');
    setEditStatus(c.status || 'active');
    setEditEngagementState(c.engagement_state || 'warm');
    setEditTags(Array.isArray(c.tags) ? [...c.tags] : []);
    setNewTagInput('');
    setShowContactModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = editEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast('Please enter a valid email address', 'error');
      return;
    }

    setSavingContact(true);
    try {
      const fullName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(' ') || (editFirstName.trim() || 'Unknown');

      if (isNewContact) {
        // Check local contacts first to avoid duplicate errors
        const existing = contacts.find(c => c.email.toLowerCase() === cleanEmail);
        if (existing) {
          toast(`A contact with email ${cleanEmail} already exists!`, 'error');
          setSavingContact(false);
          return;
        }

        const payload = {
          email: cleanEmail,
          first_name: editFirstName.trim() || null,
          last_name: editLastName.trim() || null,
          full_name: fullName,
          company: editCompany.trim() || null,
          phone: editPhone.trim() || null,
          website: editWebsite.trim() || null,
          city: editCity.trim() || null,
          state: editState.trim() || null,
          lead_source: 'manual',
          status: 'active',
          engagement_state: 'warm',
          tags: editTags,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('email_contacts')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        toast('Contact added successfully!', 'success');
        setContacts(prev => [data as EmailContact, ...prev]);
        setShowContactModal(false);
      } else {
        if (!editingContactId) return;

        const updatePayload: Record<string, unknown> = {
          first_name: editFirstName.trim() || null,
          last_name: editLastName.trim() || null,
          full_name: fullName,
          email: cleanEmail,
          company: editCompany.trim() || null,
          phone: editPhone.trim() || null,
          website: editWebsite.trim() || null,
          city: editCity.trim() || null,
          state: editState.trim() || null,
          status: editStatus,
          engagement_state: editEngagementState,
          tags: editTags,
          updated_at: new Date().toISOString(),
        };

        if (editStatus === 'active') {
          updatePayload.unsubscribed_at = null;
        }

        const { error } = await supabase
          .from('email_contacts')
          .update(updatePayload)
          .eq('id', editingContactId);

        if (error) throw error;

        toast('Contact updated successfully!', 'success');
        setContacts(prev => prev.map(c => c.id === editingContactId ? {
          ...c,
          ...updatePayload,
        } : c));
        setShowContactModal(false);
      }
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.handleSaveContact' });
      toast(err.message || 'Failed to save contact', 'error');
    } finally {
      setSavingContact(false);
    }
  };

  const handleApplyBatchTags = async () => {
    const tag = batchTagInput.trim().toLowerCase();
    if (!tag || selectedContactIds.size === 0) return;

    setSavingBatchTags(true);
    try {
      const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));
      for (const contact of selectedContacts) {
        let currentTags = Array.isArray(contact.tags) ? [...contact.tags] : [];
        if (batchTagAction === 'add') {
          if (!currentTags.includes(tag)) currentTags.push(tag);
        } else {
          currentTags = currentTags.filter(t => t !== tag);
        }

        await supabase
          .from('email_contacts')
          .update({ tags: currentTags, updated_at: new Date().toISOString() })
          .eq('id', contact.id);
      }

      toast(`Successfully ${batchTagAction === 'add' ? 'added tag to' : 'removed tag from'} ${selectedContactIds.size} contacts!`, 'success');
      await loadContacts();
      setShowBatchTagModal(false);
      setBatchTagInput('');
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.handleApplyBatchTags' });
      toast(err.message || 'Failed to update tags', 'error');
    } finally {
      setSavingBatchTags(false);
    }
  };

  const columns: ColumnDef<EmailContact>[] = [
    {
      id: 'select',
      header: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isAllFilteredSelected}
            ref={el => {
              if (el) el.indeterminate = isSomeFilteredSelected && !isAllFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            style={{ cursor: 'pointer' }}
          />
        </div>
      ),
      sortable: false,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedContactIds.has(row.id)}
            onChange={() => toggleSelectContact(row.id)}
            style={{ cursor: 'pointer' }}
          />
        </div>
      ),
    },
    {
      header: 'Name', id: 'full_name',
      cell: (row) => {
        const isSuppressed = (row.status as string) === 'suppressed' || row.engagement_state === 'suppressed' || row.status === 'unsubscribed';
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 600, margin: 0 }}>
                {row.first_name && row.last_name
                  ? `${row.first_name} ${row.last_name}`
                  : row.full_name || 'Unknown'}
              </p>
              {isSuppressed && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 4,
                    background: 'hsl(var(--destructive) / 0.15)',
                    color: 'hsl(var(--destructive))',
                    fontWeight: 600,
                  }}
                  title="Contact has unsubscribed or is suppressed from outreach"
                >
                  Suppressed
                </span>
              )}
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 0' }}>{row.email}</p>
          </div>
        );
      },
    },
    {
      header: 'Company', accessorKey: 'company',
      cell: (row) => <span style={{ fontWeight: 500 }}>{row.company ?? <span className="text-muted">—</span>}</span>
    },
    {
      header: 'Sequence & Stage',
      id: 'sequence_stage',
      sortable: false,
      cell: (row) => {
        const enrs = enrollmentMap[row.id] ?? [];
        if (enrs.length === 0) return <span className="text-muted" style={{ fontSize: '0.75rem' }}>—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 150 }}>
            {enrs.map((enr, i) => {
              const isActive = enr.status === 'active';
              const isCompleted = enr.status === 'completed';
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isCompleted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 160,
                  }} title={enr.campaignName}>{enr.campaignName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '0.12rem 0.4rem',
                      borderRadius: 4,
                      fontWeight: 600,
                      background: isActive ? 'hsl(217 91% 60% / 0.18)' : isCompleted ? 'hsl(142 71% 45% / 0.15)' : 'hsl(var(--destructive) / 0.15)',
                      color: isActive ? 'hsl(217 91% 60%)' : isCompleted ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))',
                    }}>
                      {isActive ? `Day ${enr.stepNumber} (waiting)` : isCompleted ? 'Completed' : enr.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      header: 'Actions', id: 'actions', sortable: false,
      cell: (row) => (
        <div style={{ display: 'flex', gap: '0.35rem', whiteSpace: 'nowrap' }}>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
            onClick={(e) => { e.stopPropagation(); openTimeline(row); }}
            title="View lead activity timeline"
          >
            <FiClock size={12} /> Timeline
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            onClick={(e) => { e.stopPropagation(); openEditContactModal(row); }}
            title="Edit contact details and tags"
          >
            <FiTag size={12} /> Edit
          </button>
        </div>
      ),
    },
    {
      header: 'Phone', accessorKey: 'phone',
      cell: (row) => (
        <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {row.phone ?? <span className="text-muted">—</span>}
        </span>
      )
    },
    {
      header: 'Website', id: 'website',
      cell: (row) => {
        if (!row.website) return <span className="text-muted">—</span>;
        const href = row.website.startsWith('http') ? row.website : `https://${row.website}`;
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'hsl(var(--primary))', fontSize: '0.75rem', textDecoration: 'none' }}
          >
            {row.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            <FiExternalLink size={11} />
          </a>
        );
      }
    },
    {
      header: 'Location', id: 'location',
      cell: (row) => {
        const loc = [row.city, row.state].filter(Boolean).join(', ');
        return loc ? (
          <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{loc}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      }
    },
    {
      header: 'Tags', id: 'tags',
      cell: (row) => (
        <div
          style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', maxWidth: 220, cursor: 'pointer' }}
          onClick={() => openEditContactModal(row)}
          title="Click to edit tags"
        >
          {(row.tags && row.tags.length > 0) ? (
            row.tags.map(t => (
              <span
                key={t}
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  background: t.includes('lawn') ? 'hsl(142 71% 45% / 0.15)' :
                              t.includes('hvac') || t.includes('plumb') ? 'hsl(217 91% 60% / 0.15)' :
                              t.includes('held-back') ? 'hsl(0 84% 60% / 0.15)' :
                              'hsl(var(--secondary))',
                  color: t.includes('lawn') ? 'hsl(142 71% 45%)' :
                         t.includes('hvac') || t.includes('plumb') ? 'hsl(217 91% 60%)' :
                         t.includes('held-back') ? 'hsl(0 84% 60%)' :
                         'inherit',
                }}
              >
                {t}
              </span>
            ))
          ) : (
            <span className="text-muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>+ Add tag</span>
          )}
        </div>
      )
    },
    {
      header: 'Source', accessorKey: 'lead_source',
      cell: (row) => (
        <span style={{ padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: 'hsl(var(--secondary))' }}>
          {SOURCE_LABELS[row.lead_source] ?? row.lead_source}
        </span>
      ),
    },
    {
      header: 'Status', accessorKey: 'status',
      cell: (row) => (
        <span style={{
          padding: '0.2rem 0.5rem',
          borderRadius: 999,
          fontSize: '0.7rem',
          fontWeight: 600,
          background: row.status === 'active' ? 'hsl(142 71% 45% / 0.1)' : 'hsl(var(--destructive) / 0.1)',
          color: row.status === 'active' ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))',
        }}>
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className="page-content">
      <style>{`
        /* Always show custom scrollbar on table */
        .data-table-wrapper {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--primary) / 0.5) hsl(var(--secondary));
        }
        .data-table-wrapper::-webkit-scrollbar {
          height: 8px;
        }
        .data-table-wrapper::-webkit-scrollbar-track {
          background: hsl(var(--secondary));
          border-radius: 4px;
        }
        .data-table-wrapper::-webkit-scrollbar-thumb {
          background: hsl(var(--primary) / 0.6);
          border-radius: 4px;
        }
        .data-table-wrapper::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary));
        }
      `}</style>
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length.toLocaleString()} total contacts`}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" onClick={openAddContactModal}><FiUserPlus style={{ marginRight: '0.3rem' }} /> Add Contact</button>
            <button className="btn btn--secondary btn--sm" onClick={syncCalculatorLeads} disabled={syncing}><FiRefreshCw style={{ marginRight: '0.3rem' }} /> Sync Calculator Leads</button>
            <button className="btn btn--secondary btn--sm" onClick={syncContactRequests} disabled={syncing}><FiRefreshCw style={{ marginRight: '0.3rem' }} /> Sync Contact Requests</button>
            <button className="btn btn--secondary btn--sm" onClick={() => fileInputRef.current?.click()}><FiUpload style={{ marginRight: '0.3rem' }} /> Import CSV</button>
            <button className="btn btn--secondary btn--sm" onClick={exportCsv} disabled={contacts.length === 0}><FiDownload style={{ marginRight: '0.3rem' }} /> Export</button>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        }
      />

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="Search by name, email, company, city, state..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" style={{ width: 180 }} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-input" style={{ width: 180 }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="page-card">
        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={columns as unknown as ColumnDef<Record<string, unknown>>[]}
          emptyMessage={loading ? 'Loading...' : 'No contacts found.'}
          defaultSort={{ key: 'created_at', desc: true }}
        />
      </div>

      {showImportModal && csvPreview && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Import CSV — Map Columns & Add Tags</h3>
              <button className="icon-button" onClick={() => setShowImportModal(false)}><FiX /></button>
            </div>

            {/* Custom Tags Field */}
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'hsl(var(--secondary) / 0.5)', borderRadius: 8 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                <FiTag /> Tags for this import (comma-separated):
              </label>
              <input
                className="form-input"
                style={{ marginTop: '0.35rem' }}
                placeholder="e.g. lawn-care, charlotte-nc, sequence-a"
                value={csvTags}
                onChange={e => setCsvTags(e.target.value)}
              />
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.35rem', marginBottom: 0 }}>
                These tags will be applied to all leads in this CSV, making it easy to filter and enroll them into specific sequences.
              </p>
            </div>

            {/* Column Mapping Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { field: 'email', label: 'Email', required: true },
                { field: 'first_name', label: 'First Name' },
                { field: 'last_name', label: 'Last Name' },
                { field: 'company', label: 'Company Name' },
                { field: 'phone', label: 'Phone Number' },
                { field: 'website', label: 'Website' },
                { field: 'city', label: 'City' },
                { field: 'state', label: 'State' },
              ].map(({ field, label, required }) => (
                <div key={field}>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    {label} {required && <span style={{ color: 'hsl(var(--destructive))' }}>*</span>}
                  </label>
                  <select
                    className="form-input"
                    value={csvMapping[field] ?? ''}
                    onChange={e => setCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— Not mapped —</option>
                    {csvPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview Table */}
            <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Data Preview (first 5 rows):</p>
            <div style={{ overflowX: 'auto', marginBottom: '1rem', maxHeight: 180, border: '1px solid hsl(var(--border))', borderRadius: 6 }}>
              <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {csvPreview.headers.map(h => (
                      <th key={h} style={{ padding: '0.4rem 0.5rem', background: 'hsl(var(--secondary))', textAlign: 'left', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ padding: '0.35rem 0.5rem', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!csvMapping.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(38 92% 50%)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <FiAlertCircle /> Please map the Email column to proceed
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn--secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleImportConfirm} disabled={!csvMapping.email || importing}>
                <FiCheck style={{ marginRight: '0.3rem' }} />{importing ? 'Importing…' : 'Import Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Batch Selection Bar */}
      {selectedContactIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--primary))',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
          borderRadius: '999px',
          padding: '0.6rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          zIndex: 90,
        }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {selectedContactIds.size} contact{selectedContactIds.size > 1 ? 's' : ''} selected
          </span>
          <div style={{ height: 16, width: 1, background: 'hsl(var(--border))' }} />
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setSelectedContactIds(new Set())}
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', borderRadius: '999px' }}
          >
            Clear
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setShowBatchTagModal(true)}
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <FiTag size={13} /> Manage Tags ({selectedContactIds.size})
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShowSequenceModal(true)}
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <FiPlay size={13} /> Add to Sequence
            </button>
          </div>
        </div>
      )}

      {/* Sequence Enrollment Modal */}
      {showSequenceModal && (
        <div className="modal-backdrop" onClick={() => setShowSequenceModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiPlay /> Enroll in Sequence
              </h3>
              <button className="icon-button" onClick={() => setShowSequenceModal(false)}><FiX /></button>
            </div>

            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Enroll <strong>{selectedContactIds.size} selected contact(s)</strong> directly into an automated sequence.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Target Cold Sequence</label>
              <select
                className="form-input"
                value={selectedSequenceId}
                onChange={e => setSelectedSequenceId(e.target.value)}
              >
                {sequences.length === 0 ? (
                  <option value="">No active sequence campaigns found</option>
                ) : (
                  sequences.map(s => (
                    <option key={s.id} value={s.id} disabled={s.step_count === 0}>
                      {s.name} ({s.status.toUpperCase()}){s.step_count === 0 ? ' — (No steps configured)' : ` — ${s.step_count} steps`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div style={{ background: 'hsl(var(--secondary) / 0.5)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>👥 City-Locked Founder Routing</p>
              <p className="text-muted" style={{ margin: 0 }}>
                Contacts tagged <code>charlotte-nc</code> are sent by Shantanu. Contacts tagged <code>cedar-rapids-ia</code> are sent by Ranjit. Day 0 fires immediately, follow-ups scheduled 7 days a week.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowSequenceModal(false)}
                disabled={enrolling}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={enrolling || !selectedSequenceId}
                onClick={handleEnrollSelectedInSequence}
              >
                {enrolling ? 'Enrolling…' : `Confirm & Enroll ${selectedContactIds.size} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Single Contact Modal */}
      {showContactModal && (
        <div className="modal-backdrop" onClick={() => setShowContactModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isNewContact ? <FiUserPlus /> : <FiTag />}
                {isNewContact ? 'Add Contact Manually' : 'Edit Contact & Tags'}
              </h3>
              <button className="icon-button" onClick={() => setShowContactModal(false)}><FiX /></button>
            </div>

            <form onSubmit={handleSaveContact}>
              {!isNewContact && (editStatus === 'suppressed' || editEngagementState === 'suppressed') && (
                <div style={{ padding: '0.65rem 0.85rem', background: 'hsl(var(--destructive) / 0.1)', border: '1px solid hsl(var(--destructive) / 0.25)', borderRadius: 8, marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8rem', color: 'hsl(var(--destructive))' }}>Contact is Suppressed / Unsubscribed</p>
                    <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.72rem' }}>Outreach emails are blocked for this contact. Reactivate to allow sequence enrollment.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      setEditStatus('active');
                      setEditEngagementState('warm');
                      toast('Status set to Active. Click Save Changes to apply.', 'success');
                    }}
                  >
                    Reactivate
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    className="form-input"
                    value={editFirstName}
                    onChange={e => setEditFirstName(e.target.value)}
                    placeholder="e.g. John"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-input"
                    value={editLastName}
                    onChange={e => setEditLastName(e.target.value)}
                    placeholder="e.g. Smith"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    required
                    className="form-input"
                    placeholder="john@example.com"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Company</label>
                  <input
                    className="form-input"
                    value={editCompany}
                    onChange={e => setEditCompany(e.target.value)}
                    placeholder="e.g. ABC Plumbing"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    className="form-input"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div>
                  <label className="form-label">Website</label>
                  <input
                    className="form-input"
                    value={editWebsite}
                    onChange={e => setEditWebsite(e.target.value)}
                    placeholder="e.g. abcplumbing.com"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label className="form-label">City</label>
                  <input
                    className="form-input"
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    placeholder="e.g. Charlotte"
                  />
                </div>
                <div>
                  <label className="form-label">State</label>
                  <input
                    className="form-input"
                    value={editState}
                    onChange={e => setEditState(e.target.value)}
                    placeholder="e.g. NC"
                  />
                </div>
              </div>

              {/* Tags Section */}
              <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'hsl(var(--secondary) / 0.5)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Tags</label>
                  <span className="text-muted" style={{ fontSize: '0.7rem' }}>Sequence &amp; city routing</span>
                </div>

                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {editTags.map(t => (
                    <span
                      key={t}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        background: 'hsl(var(--secondary))',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => setEditTags(editTags.filter(item => item !== t))}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'hsl(var(--muted-foreground))' }}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {editTags.length === 0 && <span className="text-muted" style={{ fontSize: '0.75rem' }}>No tags assigned</span>}
                </div>

                {/* Common suggested tags */}
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  {['lawn-care', 'hvac-plumbing', 'charlotte-nc', 'cedar-rapids-ia', 'sequence-a', 'sequence-b'].map(tag => {
                    const hasTag = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        style={{
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 4,
                          border: hasTag ? '1px solid hsl(var(--primary))' : '1px dashed hsl(var(--border))',
                          background: hasTag ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                          color: hasTag ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (hasTag) {
                            setEditTags(editTags.filter(t => t !== tag));
                          } else {
                            setEditTags([...editTags, tag]);
                          }
                        }}
                      >
                        {hasTag ? `✓ ${tag}` : `+ ${tag}`}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    className="form-input"
                    style={{ fontSize: '0.8rem' }}
                    placeholder="Add custom tag (e.g. held-back, vip)..."
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const tag = newTagInput.trim().toLowerCase();
                        if (tag && !editTags.includes(tag)) {
                          setEditTags([...editTags, tag]);
                          setNewTagInput('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      const tag = newTagInput.trim().toLowerCase();
                      if (tag && !editTags.includes(tag)) {
                        setEditTags([...editTags, tag]);
                        setNewTagInput('');
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowContactModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={savingContact || !editEmail}
                >
                  {savingContact ? 'Saving…' : (isNewContact ? 'Add Contact' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Tag Management Modal */}
      {showBatchTagModal && (
        <div className="modal-backdrop" onClick={() => setShowBatchTagModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiTag /> Manage Tags on {selectedContactIds.size} Contact(s)
              </h3>
              <button className="icon-button" onClick={() => setShowBatchTagModal(false)}><FiX /></button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Action</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn ${batchTagAction === 'add' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                  onClick={() => setBatchTagAction('add')}
                >
                  + Add Tag
                </button>
                <button
                  type="button"
                  className={`btn ${batchTagAction === 'remove' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                  onClick={() => setBatchTagAction('remove')}
                >
                  &minus; Remove Tag
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Tag Name</label>
              <input
                className="form-input"
                placeholder="e.g. held-back, enrolled-sequence-a, charlotte-nc"
                value={batchTagInput}
                onChange={e => setBatchTagInput(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                {['held-back', 'charlotte-nc', 'cedar-rapids-ia', 'lawn-care', 'hvac-plumbing'].map(quickTag => (
                  <button
                    key={quickTag}
                    type="button"
                    className="btn btn--secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    onClick={() => setBatchTagInput(quickTag)}
                  >
                    {quickTag}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowBatchTagModal(false)}
                disabled={savingBatchTags}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={savingBatchTags || !batchTagInput.trim()}
                onClick={handleApplyBatchTags}
              >
                {savingBatchTags ? 'Applying…' : `${batchTagAction === 'add' ? 'Add' : 'Remove'} Tag`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lead Activity Timeline Drawer ─────────────────────────────── */}
      {timelineContact && (
        <div
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: 'hsl(var(--background))',
            borderLeft: '1px solid hsl(var(--border))',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
          }}
        >
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to   { transform: translateX(0);    opacity: 1; }
            }
            .tl-event { display: flex; gap: 0.75rem; position: relative; padding-bottom: 1.4rem; }
            .tl-event:not(:last-child)::before {
              content: '';
              position: absolute;
              left: 11px;
              top: 24px;
              bottom: 0;
              width: 2px;
              background: hsl(var(--border));
            }
            .tl-dot {
              flex-shrink: 0;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-top: 2px;
            }
          `}</style>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: '1px solid hsl(var(--border))',
            gap: '1rem',
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {timelineContact.first_name && timelineContact.last_name
                  ? `${timelineContact.first_name} ${timelineContact.last_name}`
                  : timelineContact.full_name || 'Contact'}
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
                {timelineContact.email}
              </p>
              {timelineContact.company && (
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', fontWeight: 600 }}>
                  {timelineContact.company}
                </p>
              )}
            </div>
            <button
              className="icon-button"
              onClick={() => setTimelineContact(null)}
              style={{ flexShrink: 0 }}
            >
              <FiX />
            </button>
          </div>

          {/* Active sequences summary */}
          {(enrollmentMap[timelineContact.id] ?? []).length > 0 && (
            <div style={{
              margin: '0.75rem 1.25rem 0',
              padding: '0.75rem',
              background: 'hsl(var(--secondary))',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
                <FiList size={11} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                Current Sequences
              </p>
              {(enrollmentMap[timelineContact.id] ?? []).map((enr, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {enr.campaignName}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: 4, fontWeight: 600,
                      background: enr.status === 'active' ? 'hsl(217 91% 60% / 0.15)' : enr.status === 'completed' ? 'hsl(142 71% 45% / 0.12)' : 'hsl(var(--destructive) / 0.1)',
                      color: enr.status === 'active' ? 'hsl(217 91% 60%)' : enr.status === 'completed' ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))',
                    }}>
                      {enr.status === 'active' ? `Step ${enr.stepNumber}` : enr.status}
                    </span>
                    {enr.nextRunAt && enr.status === 'active' && (
                      <span style={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                        Next: {fmtDate(enr.nextRunAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem 1.5rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
              <FiClock size={11} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
              Activity Timeline
            </p>

            {timelineLoading ? (
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>Loading timeline…</p>
            ) : timelineEvents.length === 0 ? (
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>No activity recorded yet.</p>
            ) : (
              <div>
                {timelineEvents.map((ev) => {
                  const dotColor =
                    ev.kind === 'enrolled'      ? 'hsl(217 91% 60%)' :
                    ev.kind === 'email_sent'    ? 'hsl(142 71% 45%)' :
                    ev.kind === 'email_failed'  ? 'hsl(0 84% 60%)' :
                    ev.kind === 'completed'     ? 'hsl(142 71% 45%)' :
                    'hsl(var(--muted-foreground))';
                  const dotBg =
                    ev.kind === 'enrolled'      ? 'hsl(217 91% 60% / 0.12)' :
                    ev.kind === 'email_sent'    ? 'hsl(142 71% 45% / 0.12)' :
                    ev.kind === 'email_failed'  ? 'hsl(0 84% 60% / 0.12)' :
                    ev.kind === 'completed'     ? 'hsl(142 71% 45% / 0.12)' :
                    'hsl(var(--secondary))';
                  const DotIcon =
                    ev.kind === 'enrolled'      ? FiList :
                    ev.kind === 'email_sent'    ? FiMail :
                    ev.kind === 'email_failed'  ? FiAlertCircle :
                    ev.kind === 'completed'     ? FiCheck :
                    FiX;
                  return (
                    <div key={ev.id} className="tl-event">
                      <div className="tl-dot" style={{ background: dotBg }}>
                        <DotIcon size={12} color={dotColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3 }}>{ev.label}</p>
                        {ev.detail && (
                          <p style={{
                            margin: '0.2rem 0 0',
                            fontSize: '0.74rem',
                            color: 'hsl(var(--muted-foreground))',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 340,
                          }} title={ev.detail}>{ev.detail}</p>
                        )}
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))' }}>
                          {fmtDateTime(ev.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop for timeline drawer */}
      {timelineContact && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setTimelineContact(null)}
        />
      )}
    </div>
  );
};
