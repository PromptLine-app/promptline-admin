import { adminApi } from '@/lib/adminApi';

export type LeadStatus = 'new' | 'contacted' | 'engaged' | 'converted' | 'dismissed';
export type SubjectType = 'lead' | 'tenant';
export type PipelineStage =
  | 'lead' // registered, no business
  | 'stalled' // created business, onboarding not finished
  | 'no_twilio' // onboarded, no phone number
  | 'no_calls' // has number, zero calls
  | 'at_risk' // had calls, gone quiet
  | 'churned'; // billing canceled / deleted

export type PipelineEntry = {
  subject_type: SubjectType;
  subject_id: string;
  stage: PipelineStage;
  name: string | null;
  email: string | null;
  since: string | null; // signup (lead) or business-creation (tenant) date
  last_activity_at: string | null; // last call, for tenant stages
  status: LeadStatus;
  attempts: number;
  notes: string;
  last_template: string | null;
  last_contacted_at: string | null;
};

export type TemplateChoice = { key: string; label: string };

export const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'No Business',
  stalled: 'Setup Stalled',
  no_twilio: 'No Twilio',
  no_calls: 'No Calls',
  at_risk: 'At Risk',
  churned: 'Churned',
};

/** Every prospect at every drop-off stage, plus the available email templates. */
export const fetchPipeline = () =>
  adminApi<{
    entries: PipelineEntry[];
    templates: TemplateChoice[];
    thresholds: { stalledDays: number; atRiskDays: number };
  }>('/api/admin/leads', 'GET');

/** Send a re-engagement email; server bumps the attempt counter + advances status. */
export const sendEmail = (subjectType: SubjectType, subjectId: string, templateKey: string) =>
  adminApi<{ ok: true; attempts: number }>('/api/admin/leads', 'POST', {
    action: 'send',
    subjectType,
    subjectId,
    templateKey,
  });

/** Manually update a prospect's status and/or notes. */
export const updateFollowup = (
  subjectType: SubjectType,
  subjectId: string,
  patch: { status?: LeadStatus; notes?: string },
) =>
  adminApi<{ ok: true }>('/api/admin/leads', 'POST', {
    action: 'update',
    subjectType,
    subjectId,
    ...patch,
  });
