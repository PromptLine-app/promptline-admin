// Re-engagement email templates for the Lead Pipeline.
//
// ─────────────────────────────────────────────────────────────────────────────
//  PLACEHOLDER COPY — replace the `subject` and the body text in `render()` with
//  your real wording. `{{name}}` is substituted with the lead's first name (or
//  "there" when unknown) by renderTemplate() below; write the rest as plain HTML.
// ─────────────────────────────────────────────────────────────────────────────
//
// To add a template: add a key here and it automatically appears in the admin
// "Send" dropdown (the /api/admin/leads GET response advertises label+key).
//
// The server renders + sends these via the existing send-ms-email edge function
// (Microsoft Graph), the same infra used for billing reminders.

const wrap = (inner) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1e293b;line-height:1.6">
    ${inner}
    <p style="color:#64748b;font-size:13px">Questions? Just reply to this email.</p>
    <p>— The PromptLine Team</p>
  </div>`;

export const LEAD_EMAIL_TEMPLATES = {
  how_can_i_help: {
    label: 'How can I help?',
    subject: '[PLACEHOLDER] How can we help you get started?',
    render: (name) =>
      wrap(`
        <p>Hi ${name},</p>
        <p>[PLACEHOLDER] You signed up for PromptLine but haven't set up your AI
        receptionist yet. I'd love to help — is there anything blocking you, or a
        question I can answer to get you going?</p>`),
  },
  setup_help: {
    label: 'Need a hand setting up?',
    subject: '[PLACEHOLDER] Want a hand setting up your AI receptionist?',
    render: (name) =>
      wrap(`
        <p>Hi ${name},</p>
        <p>[PLACEHOLDER] Setting up your business in PromptLine takes about 5
        minutes. If you'd like, I can walk you through it or set it up with you on
        a quick call.</p>`),
  },
  still_interested: {
    label: 'Still interested?',
    subject: '[PLACEHOLDER] Still interested in PromptLine?',
    render: (name) =>
      wrap(`
        <p>Hi ${name},</p>
        <p>[PLACEHOLDER] We noticed you haven't finished getting set up. Are you
        still interested? Let me know if now isn't the right time and I'll check
        back later.</p>`),
  },
};

/** First name from a full name, or "there" when unknown. */
const firstName = (fullName) => {
  const n = (fullName || '').trim().split(/\s+/)[0];
  return n || 'there';
};

/** Resolve a template by key and render its subject + HTML body for a lead. */
export const renderTemplate = (templateKey, { fullName } = {}) => {
  const tpl = LEAD_EMAIL_TEMPLATES[templateKey];
  if (!tpl) return null;
  return { subject: tpl.subject, body: tpl.render(firstName(fullName)) };
};

/** [{ key, label }] for driving the admin dropdown. */
export const templateChoices = () =>
  Object.entries(LEAD_EMAIL_TEMPLATES).map(([key, t]) => ({ key, label: t.label }));
